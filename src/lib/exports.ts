import { LIBELLES_STATUTS_COMMANDE } from './commandes'
import { LIBELLES_MODES_PAIEMENT } from './depenses'
import { LIBELLES_STATUTS_DEVIS } from './devis'
import { LIBELLES_STATUTS_FACTURE } from './factures'
import { LIBELLES_CATEGORIES_SUPPORT, LIBELLES_MODES_PRIX, LIBELLES_TECHNIQUES, LIBELLES_TYPES_CLIENT, LIBELLES_UNITES } from './libelles'
import { enregistrerFichier } from './partage'
import { LIBELLES_MOUVEMENTS } from './stock'
import { supabase } from './supabase'

// Exports Excel (.xlsx) : dossier comptable, listes par module, sauvegarde complète.
// La bibliothèque write-excel-file est chargée à la demande.

type Valeur = string | number | Date | boolean | null | undefined
type TypeColonne = 'texte' | 'montant' | 'nombre' | 'date' | 'pourcentage'

interface Colonne<T> {
  titre: string
  valeur: (ligne: T) => Valeur
  type?: TypeColonne
  largeur?: number
}

export interface Feuille {
  nom: string
  // Les lignes et leurs colonnes sont typées par la fonction qui construit la feuille
  lignes: unknown[]
  colonnes: Colonne<never>[]
}

const feuille = <T>(nom: string, lignes: T[], colonnes: Colonne<T>[]): Feuille => ({
  nom: nom.slice(0, 31),
  lignes,
  colonnes: colonnes as unknown as Colonne<never>[],
})

const FORMATS: Record<TypeColonne, string | undefined> = {
  texte: undefined,
  montant: '#,##0.00',
  nombre: '#,##0.##',
  date: 'dd/mm/yyyy',
  pourcentage: '0.##" %"',
}

const enDate = (iso: string | null | undefined) => (iso ? new Date(`${iso.slice(0, 10)}T12:00:00Z`) : null)
const nombre = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v))

/** Fabrique le classeur et l'enregistre (téléchargement ou partage sur Android) */
export async function enregistrerClasseur(feuilles: Feuille[], nomFichier: string) {
  const { default: writeExcelFile } = await import('write-excel-file/browser')
  const donnees = feuilles.map((f) => {
    const entete = f.colonnes.map((c) => ({ value: c.titre, fontWeight: 'bold' as const, backgroundColor: '#e8eefc' }))
    const lignes = (f.lignes as never[]).map((ligne) =>
      f.colonnes.map((c) => {
        const v = c.valeur(ligne)
        if (v === null || v === undefined || v === '') return null
        const type = c.type ?? 'texte'
        if (type === 'date') return { value: v as Date, type: Date, format: FORMATS.date }
        if (type === 'texte') return { value: String(v), type: String }
        return { value: Number(v), type: Number, format: FORMATS[type] }
      }),
    )
    return {
      data: [entete, ...lignes],
      sheet: f.nom,
      columns: f.colonnes.map((c) => ({ width: c.largeur ?? (c.type === 'date' ? 12 : c.type === 'texte' ? 24 : 14) })),
      stickyRowsCount: 1,
    }
  })
  // Le typage des cellules de la bibliothèque est très strict : les données sont construites ci-dessus
  const blob = await writeExcelFile(donnees as never).toBlob()
  await enregistrerFichier(blob, nomFichier, nomFichier)
}

// ---------------------------------------------------------------- Lecture des données

export interface Periode {
  debut: string // AAAA-MM-JJ
  fin: string // AAAA-MM-JJ inclus
}

async function lire<T>(requete: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
  const { data, error } = await requete
  if (error) throw new Error(error.message)
  return (data ?? []) as T[]
}

/* eslint-disable @typescript-eslint/no-explicit-any -- lignes de jointures Supabase */
type Ligne = any

export async function feuilleFactures(p?: Periode): Promise<Feuille> {
  let q = supabase
    .from('factures')
    .select('numero, date_facture, date_echeance, statut, total_ht, taux_tva, total_tva, total_ttc, montant_paye, notes, client:clients(nom, numero_fiscal), commande:commandes(numero)')
    .order('date_facture')
  if (p) q = q.gte('date_facture', p.debut).lte('date_facture', p.fin)
  return feuille('Factures', await lire<Ligne>(q), [
    { titre: 'N° facture', valeur: (f) => f.numero, largeur: 16 },
    { titre: 'Date', valeur: (f) => enDate(f.date_facture), type: 'date' },
    { titre: 'Client', valeur: (f) => f.client?.nom, largeur: 30 },
    { titre: 'NIF client', valeur: (f) => f.client?.numero_fiscal, largeur: 14 },
    { titre: 'Objet', valeur: (f) => f.notes, largeur: 40 },
    { titre: 'Commande', valeur: (f) => f.commande?.numero, largeur: 16 },
    { titre: 'Total HT', valeur: (f) => nombre(f.total_ht), type: 'montant' },
    { titre: 'Taux TVA', valeur: (f) => nombre(f.taux_tva), type: 'pourcentage', largeur: 10 },
    { titre: 'TVA', valeur: (f) => nombre(f.total_tva), type: 'montant' },
    { titre: 'Total TTC', valeur: (f) => nombre(f.total_ttc), type: 'montant' },
    { titre: 'Payé', valeur: (f) => nombre(f.montant_paye), type: 'montant' },
    { titre: 'Reste à payer', valeur: (f) => (f.statut === 'annulee' ? 0 : Math.max(Number(f.total_ttc) - Number(f.montant_paye), 0)), type: 'montant' },
    { titre: 'Échéance', valeur: (f) => enDate(f.date_echeance), type: 'date' },
    { titre: 'Statut', valeur: (f) => LIBELLES_STATUTS_FACTURE[f.statut as keyof typeof LIBELLES_STATUTS_FACTURE], largeur: 16 },
  ])
}

export async function feuillePaiements(p?: Periode): Promise<Feuille> {
  let q = supabase
    .from('paiements')
    .select('date_paiement, montant, mode, reference, facture:factures(numero, client:clients(nom))')
    .order('date_paiement')
  if (p) q = q.gte('date_paiement', p.debut).lte('date_paiement', p.fin)
  return feuille('Paiements reçus', await lire<Ligne>(q), [
    { titre: 'Date', valeur: (x) => enDate(x.date_paiement), type: 'date' },
    { titre: 'Facture', valeur: (x) => x.facture?.numero, largeur: 16 },
    { titre: 'Client', valeur: (x) => x.facture?.client?.nom, largeur: 30 },
    { titre: 'Montant', valeur: (x) => nombre(x.montant), type: 'montant' },
    { titre: 'Mode', valeur: (x) => LIBELLES_MODES_PAIEMENT[x.mode as keyof typeof LIBELLES_MODES_PAIEMENT], largeur: 20 },
    { titre: 'Référence', valeur: (x) => x.reference, largeur: 30 },
  ])
}

export async function feuilleDepenses(p?: Periode): Promise<Feuille> {
  let q = supabase
    .from('depenses')
    .select('date_depense, libelle, montant, mode, beneficiaire, reference, notes, categorie:categories_depense(nom)')
    .order('date_depense')
  if (p) q = q.gte('date_depense', p.debut).lte('date_depense', p.fin)
  return feuille('Dépenses', await lire<Ligne>(q), [
    { titre: 'Date', valeur: (d) => enDate(d.date_depense), type: 'date' },
    { titre: 'Catégorie', valeur: (d) => d.categorie?.nom, largeur: 28 },
    { titre: 'Libellé', valeur: (d) => d.libelle, largeur: 40 },
    { titre: 'Montant', valeur: (d) => nombre(d.montant), type: 'montant' },
    { titre: 'Payé par', valeur: (d) => LIBELLES_MODES_PAIEMENT[d.mode as keyof typeof LIBELLES_MODES_PAIEMENT], largeur: 20 },
    { titre: 'Bénéficiaire', valeur: (d) => d.beneficiaire, largeur: 24 },
    { titre: 'Référence', valeur: (d) => d.reference, largeur: 18 },
    { titre: 'Notes', valeur: (d) => d.notes, largeur: 30 },
  ])
}

export async function feuilleDevis(p?: Periode): Promise<Feuille> {
  let q = supabase
    .from('devis')
    .select('numero, date_devis, validite_jours, statut, objet, remise_pct, taux_tva, total_ht, total_ttc, notes, client:clients(nom)')
    .order('date_devis')
  if (p) q = q.gte('date_devis', p.debut).lte('date_devis', p.fin)
  return feuille('Devis', await lire<Ligne>(q), [
    { titre: 'N° devis', valeur: (d) => d.numero, largeur: 16 },
    { titre: 'Date', valeur: (d) => enDate(d.date_devis), type: 'date' },
    { titre: 'Client', valeur: (d) => d.client?.nom, largeur: 30 },
    { titre: 'Objet', valeur: (d) => d.objet, largeur: 45 },
    { titre: 'Remise', valeur: (d) => nombre(d.remise_pct), type: 'pourcentage', largeur: 9 },
    { titre: 'Taux TVA', valeur: (d) => nombre(d.taux_tva), type: 'pourcentage', largeur: 10 },
    { titre: 'Total HT', valeur: (d) => nombre(d.total_ht), type: 'montant' },
    { titre: 'Total TTC', valeur: (d) => nombre(d.total_ttc), type: 'montant' },
    { titre: 'Validité (jours)', valeur: (d) => nombre(d.validite_jours), type: 'nombre' },
    { titre: 'Statut', valeur: (d) => LIBELLES_STATUTS_DEVIS[d.statut as keyof typeof LIBELLES_STATUTS_DEVIS], largeur: 12 },
    { titre: 'Remarques', valeur: (d) => d.notes, largeur: 30 },
  ])
}

export async function feuilleCommandes(p?: Periode): Promise<Feuille> {
  let q = supabase
    .from('commandes')
    .select('numero, date_commande, statut, objet, urgent, date_livraison_prevue, date_livraison_reelle, acompte, remise_pct, taux_tva, client:clients(nom), devis:devis(numero), lignes:commande_lignes(prix_total_ht)')
    .order('date_commande')
  if (p) q = q.gte('date_commande', p.debut).lte('date_commande', p.fin)
  const totalHt = (c: Ligne) =>
    Math.round((c.lignes ?? []).reduce((s: number, l: Ligne) => s + Number(l.prix_total_ht), 0) * (1 - Number(c.remise_pct) / 100) * 100) / 100
  return feuille('Commandes', await lire<Ligne>(q), [
    { titre: 'N° commande', valeur: (c) => c.numero, largeur: 16 },
    { titre: 'Date', valeur: (c) => enDate(c.date_commande), type: 'date' },
    { titre: 'Client', valeur: (c) => c.client?.nom, largeur: 30 },
    { titre: 'Objet', valeur: (c) => c.objet, largeur: 45 },
    { titre: 'Devis', valeur: (c) => c.devis?.numero, largeur: 16 },
    { titre: 'Total HT', valeur: totalHt, type: 'montant' },
    { titre: 'Acompte', valeur: (c) => nombre(c.acompte), type: 'montant' },
    { titre: 'Urgent', valeur: (c) => (c.urgent ? 'Oui' : ''), largeur: 8 },
    { titre: 'Livraison prévue', valeur: (c) => enDate(c.date_livraison_prevue), type: 'date', largeur: 15 },
    { titre: 'Livrée le', valeur: (c) => enDate(c.date_livraison_reelle), type: 'date' },
    { titre: 'Statut', valeur: (c) => LIBELLES_STATUTS_COMMANDE[c.statut as keyof typeof LIBELLES_STATUTS_COMMANDE], largeur: 16 },
  ])
}

export async function feuilleClients(): Promise<Feuille> {
  const lignes = await lire<Ligne>(supabase.from('clients').select('*').order('nom'))
  return feuille('Clients', lignes, [
    { titre: 'Nom', valeur: (c) => c.nom, largeur: 32 },
    { titre: 'Type', valeur: (c) => LIBELLES_TYPES_CLIENT[c.type_client as keyof typeof LIBELLES_TYPES_CLIENT], largeur: 16 },
    { titre: 'Contact', valeur: (c) => c.contact, largeur: 22 },
    { titre: 'Téléphone', valeur: (c) => c.telephone, largeur: 22 },
    { titre: 'E-mail', valeur: (c) => c.email, largeur: 26 },
    { titre: 'Adresse', valeur: (c) => c.adresse, largeur: 30 },
    { titre: 'NIF', valeur: (c) => c.numero_fiscal, largeur: 14 },
    { titre: 'Remise habituelle', valeur: (c) => nombre(c.remise_pct), type: 'pourcentage', largeur: 10 },
    { titre: 'Actif', valeur: (c) => (c.actif ? 'Oui' : 'Non'), largeur: 7 },
    { titre: 'Notes', valeur: (c) => c.notes, largeur: 30 },
  ])
}

export async function feuillesStock(p?: Periode): Promise<Feuille[]> {
  const articles = await lire<Ligne>(supabase.from('supports').select('*').order('categorie').order('nom'))
  let q = supabase.from('mouvements_stock').select('created_at, type, quantite, motif, support:supports(nom, unite)').order('created_at')
  if (p) q = q.gte('created_at', `${p.debut}T00:00:00`).lte('created_at', `${p.fin}T23:59:59`)
  const mouvements = await lire<Ligne>(q)
  return [
    feuille('Stock', articles, [
      { titre: 'Catégorie', valeur: (a) => LIBELLES_CATEGORIES_SUPPORT[a.categorie as keyof typeof LIBELLES_CATEGORIES_SUPPORT], largeur: 22 },
      { titre: 'Article', valeur: (a) => a.nom, largeur: 40 },
      { titre: 'Unité', valeur: (a) => LIBELLES_UNITES[a.unite as keyof typeof LIBELLES_UNITES], largeur: 12 },
      { titre: 'Stock', valeur: (a) => nombre(a.stock_actuel), type: 'nombre' },
      { titre: 'Seuil d’alerte', valeur: (a) => nombre(a.seuil_alerte), type: 'nombre' },
      { titre: 'À réapprovisionner', valeur: (a) => (Number(a.seuil_alerte) > 0 && Number(a.stock_actuel) <= Number(a.seuil_alerte) ? 'Oui' : ''), largeur: 12 },
      { titre: 'Dernier prix d’achat', valeur: (a) => nombre(a.prix_unitaire), type: 'montant' },
      { titre: 'Valeur du stock', valeur: (a) => Math.max(Number(a.stock_actuel), 0) * Number(a.prix_unitaire), type: 'montant' },
      { titre: 'Fournisseur', valeur: (a) => a.fournisseur, largeur: 22 },
      { titre: 'Actif', valeur: (a) => (a.actif ? 'Oui' : 'Non'), largeur: 7 },
    ]),
    feuille('Mouvements de stock', mouvements, [
      { titre: 'Date', valeur: (m) => enDate(m.created_at), type: 'date' },
      { titre: 'Article', valeur: (m) => m.support?.nom, largeur: 40 },
      { titre: 'Mouvement', valeur: (m) => LIBELLES_MOUVEMENTS[m.type as keyof typeof LIBELLES_MOUVEMENTS], largeur: 22 },
      { titre: 'Quantité', valeur: (m) => (m.type === 'sortie' ? -Math.abs(Number(m.quantite)) : Number(m.quantite)), type: 'nombre' },
      { titre: 'Unité', valeur: (m) => (m.support ? LIBELLES_UNITES[m.support.unite as keyof typeof LIBELLES_UNITES] : ''), largeur: 12 },
      { titre: 'Motif', valeur: (m) => m.motif, largeur: 40 },
    ]),
  ]
}

/** Synthèse par mois : facturé, encaissé, dépenses, résultat (trésorerie) */
export async function feuilleSynthese(p: Periode): Promise<Feuille> {
  const [factures, paiements, depenses] = await Promise.all([
    lire<Ligne>(supabase.from('factures').select('date_facture, total_ttc, statut').gte('date_facture', p.debut).lte('date_facture', p.fin).neq('statut', 'annulee')),
    lire<Ligne>(supabase.from('paiements').select('date_paiement, montant').gte('date_paiement', p.debut).lte('date_paiement', p.fin)),
    lire<Ligne>(supabase.from('depenses').select('date_depense, montant').gte('date_depense', p.debut).lte('date_depense', p.fin)).catch(() => []),
  ])
  const mois: string[] = []
  for (let d = new Date(`${p.debut.slice(0, 7)}-01T12:00:00Z`); d.toISOString().slice(0, 7) <= p.fin.slice(0, 7); d.setUTCMonth(d.getUTCMonth() + 1)) {
    mois.push(d.toISOString().slice(0, 7))
  }
  const somme = (lignes: Ligne[], champDate: string, champMontant: string, m: string) =>
    lignes.filter((l) => String(l[champDate]).startsWith(m)).reduce((s, l) => s + Number(l[champMontant]), 0)
  const lignes = mois.map((m) => {
    const encaisse = somme(paiements, 'date_paiement', 'montant', m)
    const depense = somme(depenses, 'date_depense', 'montant', m)
    return { mois: m, facture: somme(factures, 'date_facture', 'total_ttc', m), encaisse, depense, resultat: encaisse - depense }
  })
  const total = lignes.reduce(
    (t, l) => ({ mois: 'TOTAL', facture: t.facture + l.facture, encaisse: t.encaisse + l.encaisse, depense: t.depense + l.depense, resultat: t.resultat + l.resultat }),
    { mois: 'TOTAL', facture: 0, encaisse: 0, depense: 0, resultat: 0 },
  )
  return feuille('Synthèse', [...lignes, total], [
    {
      titre: 'Mois',
      valeur: (l) => (l.mois === 'TOTAL' ? 'TOTAL' : new Date(`${l.mois}-01T12:00:00Z`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })),
      largeur: 18,
    },
    { titre: 'Facturé (TTC)', valeur: (l) => l.facture, type: 'montant', largeur: 16 },
    { titre: 'Encaissé', valeur: (l) => l.encaisse, type: 'montant', largeur: 16 },
    { titre: 'Dépenses', valeur: (l) => l.depense, type: 'montant', largeur: 16 },
    { titre: 'Résultat (encaissé − dépenses)', valeur: (l) => l.resultat, type: 'montant', largeur: 28 },
  ])
}

/** Sauvegarde complète : toutes les tables utiles, toutes dates */
export async function feuillesSauvegarde(): Promise<Feuille[]> {
  const [produits, finitions, machines, parametres, lignesDevis, lignesCommandes] = await Promise.all([
    lire<Ligne>(supabase.from('produits').select('*').order('nom')).catch(() => []),
    lire<Ligne>(supabase.from('finitions').select('*').order('nom')),
    lire<Ligne>(supabase.from('machines').select('*').order('nom')),
    lire<Ligne>(supabase.from('parametres').select('*').order('cle')),
    lire<Ligne>(supabase.from('devis_lignes').select('*, devis:devis(numero)').order('devis_id').order('ordre')),
    lire<Ligne>(supabase.from('commande_lignes').select('*, commande:commandes(numero)').order('commande_id').order('id')),
  ])
  const autres = await Promise.all([
    feuilleClients(),
    feuilleDevis(),
    feuilleCommandes(),
    feuilleFactures(),
    feuillePaiements(),
    feuilleDepenses().catch(() => feuille('Dépenses', [], [])),
    ...(await feuillesStock()),
  ])
  return [
    ...autres,
    feuille('Lignes de devis', lignesDevis, [
      { titre: 'Devis', valeur: (l) => l.devis?.numero, largeur: 16 },
      { titre: 'Désignation', valeur: (l) => l.description, largeur: 45 },
      { titre: 'Technique', valeur: (l) => LIBELLES_TECHNIQUES[l.technique as keyof typeof LIBELLES_TECHNIQUES], largeur: 14 },
      { titre: 'Quantité', valeur: (l) => nombre(l.quantite), type: 'nombre' },
      { titre: 'Largeur (mm)', valeur: (l) => nombre(l.largeur_mm), type: 'nombre' },
      { titre: 'Hauteur (mm)', valeur: (l) => nombre(l.hauteur_mm), type: 'nombre' },
      { titre: 'Prix total HT', valeur: (l) => nombre(l.prix_total_ht), type: 'montant' },
    ]),
    feuille('Lignes de commandes', lignesCommandes, [
      { titre: 'Commande', valeur: (l) => l.commande?.numero, largeur: 16 },
      { titre: 'Désignation', valeur: (l) => l.description, largeur: 45 },
      { titre: 'Technique', valeur: (l) => LIBELLES_TECHNIQUES[l.technique as keyof typeof LIBELLES_TECHNIQUES], largeur: 14 },
      { titre: 'Quantité', valeur: (l) => nombre(l.quantite), type: 'nombre' },
      { titre: 'Prix total HT', valeur: (l) => nombre(l.prix_total_ht), type: 'montant' },
      { titre: 'Production', valeur: (l) => l.statut_production, largeur: 12 },
      { titre: 'Consignes', valeur: (l) => l.instructions, largeur: 40 },
    ]),
    feuille('Produits et prix', produits, [
      { titre: 'Produit', valeur: (x) => x.nom, largeur: 40 },
      { titre: 'Technique', valeur: (x) => LIBELLES_TECHNIQUES[x.technique as keyof typeof LIBELLES_TECHNIQUES], largeur: 14 },
      { titre: 'Mode de prix', valeur: (x) => LIBELLES_MODES_PRIX[x.mode_prix as keyof typeof LIBELLES_MODES_PRIX], largeur: 22 },
      { titre: 'Prix de base', valeur: (x) => nombre(x.prix), type: 'montant' },
      { titre: 'Minimum facturé', valeur: (x) => nombre(x.quantite_minimum), type: 'nombre' },
      { titre: 'Paliers (quantité = prix)', valeur: (x) => (x.paliers ?? []).map((p: Ligne) => `${p.quantite} = ${p.prix}`).join(' ; '), largeur: 40 },
      { titre: 'Actif', valeur: (x) => (x.actif ? 'Oui' : 'Non'), largeur: 7 },
    ]),
    feuille('Finitions', finitions, [
      { titre: 'Finition', valeur: (x) => x.nom, largeur: 36 },
      { titre: 'Mode de calcul', valeur: (x) => x.mode_calcul, largeur: 14 },
      { titre: 'Prix', valeur: (x) => nombre(x.prix), type: 'montant' },
      { titre: 'Frais fixes', valeur: (x) => nombre(x.cout_fixe), type: 'montant' },
      { titre: 'Actif', valeur: (x) => (x.actif ? 'Oui' : 'Non'), largeur: 7 },
    ]),
    feuille('Machines', machines, [
      { titre: 'Machine', valeur: (x) => x.nom, largeur: 30 },
      { titre: 'Technique', valeur: (x) => LIBELLES_TECHNIQUES[x.technique as keyof typeof LIBELLES_TECHNIQUES], largeur: 14 },
      { titre: 'Notes', valeur: (x) => x.notes, largeur: 40 },
    ]),
    feuille('Paramètres', parametres, [
      { titre: 'Clé', valeur: (x) => x.cle, largeur: 24 },
      { titre: 'Valeur', valeur: (x) => x.valeur, largeur: 50 },
    ]),
  ]
}
/* eslint-enable @typescript-eslint/no-explicit-any */
