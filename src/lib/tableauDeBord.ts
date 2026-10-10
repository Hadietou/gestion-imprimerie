import { supabase } from './supabase'
import type { Role } from './types'

// Indicateurs du tableau de bord. Chaque bloc est chargé séparément : un bloc
// interdit au rôle (RLS) ou un module non installé n'empêche pas les autres.

export interface MoisFinances {
  mois: string // AAAA-MM
  encaisse: number
  depenses: number
}

export interface Indicateurs {
  finances?: {
    factureMois: number
    encaisseMois: number
    depensesMois: number
    resteAEncaisser: number
    historique: MoisFinances[]
  }
  commandes?: { enRetard: number; batEnAttente: number; aLivrer: number; enCours: number }
  production?: { aFaire: number; enCours: number; bloques: number }
  facturesEnRetard?: { nombre: number; montant: number }
  stockBas?: number
  devis?: { enAttente: number; expires: number }
}

const iso = (d: Date) => d.toISOString().slice(0, 10)
const somme = (lignes: { montant?: number }[] | null) => (lignes ?? []).reduce((s, l) => s + Number(l.montant ?? 0), 0)

export function derniersMois(n: number, reference = new Date()): string[] {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(reference.getFullYear(), reference.getMonth() - (n - 1 - i), 1))
    return d.toISOString().slice(0, 7)
  })
}

export async function chargerIndicateurs(role: Role): Promise<Indicateurs> {
  const maintenant = new Date()
  const aujourdhui = iso(maintenant)
  const mois = derniersMois(6, maintenant)
  const debutHistorique = `${mois[0]}-01`
  const moisCourant = mois[mois.length - 1]
  const debutMois = `${moisCourant}-01`
  const voitFinances = role === 'gerant' || role === 'compta'
  const voitVentes = role !== 'atelier'
  const resultat: Indicateurs = {}
  const taches: Promise<void>[] = []

  if (voitFinances) {
    taches.push(
      (async () => {
        const [paiements, depenses, factures, impayes] = await Promise.all([
          supabase.from('paiements').select('montant, date_paiement').gte('date_paiement', debutHistorique),
          supabase.from('depenses').select('montant, date_depense').gte('date_depense', debutHistorique),
          supabase.from('factures').select('total_ttc').gte('date_facture', debutMois).neq('statut', 'annulee'),
          supabase.from('v_impayes').select('reste_a_payer'),
        ])
        if (paiements.error || factures.error) return
        const historique = mois.map((m) => ({
          mois: m,
          encaisse: somme((paiements.data ?? []).filter((p) => p.date_paiement.startsWith(m))),
          // Dépenses : module facultatif (sql/07) — 0 s'il n'est pas installé
          depenses: somme((depenses.data ?? []).filter((d) => d.date_depense.startsWith(m))),
        }))
        const courant = historique[historique.length - 1]
        resultat.finances = {
          factureMois: (factures.data ?? []).reduce((s, f) => s + Number(f.total_ttc), 0),
          encaisseMois: courant.encaisse,
          depensesMois: courant.depenses,
          resteAEncaisser: (impayes.data ?? []).reduce((s, i) => s + Number(i.reste_a_payer), 0),
          historique,
        }
      })(),
    )
  }

  taches.push(
    (async () => {
      const { data, error } = await supabase
        .from('commandes')
        .select('statut, date_livraison_prevue')
        .not('statut', 'in', '(livre,annule)')
      if (error) return
      const c = data ?? []
      resultat.commandes = {
        enRetard: c.filter((x) => x.date_livraison_prevue && x.date_livraison_prevue < aujourdhui).length,
        batEnAttente: c.filter((x) => x.statut === 'bat_envoye').length,
        aLivrer: c.filter((x) => x.statut === 'termine').length,
        enCours: c.length,
      }
    })(),
  )

  if (role !== 'compta') {
    taches.push(
      (async () => {
        const { data, error } = await supabase
          .from('commande_lignes')
          .select('statut_production, commande:commandes!inner(statut)')
          .in('commande.statut', ['bat_valide', 'en_production'])
          .neq('statut_production', 'termine')
        if (error) return
        const l = data ?? []
        resultat.production = {
          aFaire: l.filter((x) => x.statut_production === 'a_faire').length,
          enCours: l.filter((x) => x.statut_production === 'en_cours').length,
          bloques: l.filter((x) => x.statut_production === 'bloque').length,
        }
      })(),
    )
  }

  if (voitVentes) {
    taches.push(
      (async () => {
        const { data, error } = await supabase.from('v_impayes').select('reste_a_payer, jours_retard').gt('jours_retard', 0)
        if (error) return
        resultat.facturesEnRetard = {
          nombre: (data ?? []).length,
          montant: (data ?? []).reduce((s, i) => s + Number(i.reste_a_payer), 0),
        }
      })(),
      (async () => {
        const { data, error } = await supabase.from('devis').select('date_devis, validite_jours').eq('statut', 'envoye')
        if (error) return
        const expire = (d: { date_devis: string; validite_jours: number }) => {
          const fin = new Date(`${d.date_devis}T12:00:00`)
          fin.setDate(fin.getDate() + d.validite_jours)
          return iso(fin) < aujourdhui
        }
        resultat.devis = {
          enAttente: (data ?? []).filter((d) => !expire(d)).length,
          expires: (data ?? []).filter(expire).length,
        }
      })(),
    )
  }

  taches.push(
    (async () => {
      const { data, error } = await supabase.from('supports').select('stock_actuel, seuil_alerte').eq('actif', true)
      if (error) return
      resultat.stockBas = (data ?? []).filter((s) => Number(s.seuil_alerte) > 0 && Number(s.stock_actuel) <= Number(s.seuil_alerte)).length
    })(),
  )

  await Promise.allSettled(taches)
  return resultat
}
