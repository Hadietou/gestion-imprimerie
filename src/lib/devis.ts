import { supabase } from './supabase'
import type { Client, Finition, Produit, Technique } from './types'

// Devis : tables devis, devis_lignes, devis_ligne_finitions (imprimerie_schema.sql)
// et fonction enregistrer_devis (sql/06_devis.sql).

export type StatutDevis = 'brouillon' | 'envoye' | 'accepte' | 'refuse' | 'expire'

export const LIBELLES_STATUTS_DEVIS: Record<StatutDevis, string> = {
  brouillon: 'Brouillon',
  envoye: 'Envoyé',
  accepte: 'Accepté',
  refuse: 'Refusé',
  expire: 'Expiré',
}

export interface DevisResume {
  id: number
  numero: string
  statut: StatutDevis
  date_devis: string
  validite_jours: number
  objet: string | null
  total_ht: number
  total_ttc: number
  client: { nom: string } | null
}

export interface LigneFinitionEnBase {
  finition_id: number
  quantite: number
  montant: number
  /** Présent au chargement d'un devis (jointure) */
  finition?: { nom: string }
}

export interface DetailCalcul {
  /** Prix du produit seul (avant finitions) */
  prix_produit?: number
  /** Explication du calcul (ex. « Lot de 500 ex. ») */
  detail?: string
  /** Vrai : prix total saisi à la main */
  prix_force?: boolean
}

export interface LigneDevisEnBase {
  id: number
  ordre: number
  description: string
  technique: Technique
  produit_id: number | null
  quantite: number
  largeur_mm: number | null
  hauteur_mm: number | null
  detail_calcul: DetailCalcul
  prix_total_ht: number
  prix_unitaire_ht: number
  finitions: LigneFinitionEnBase[]
}

export interface DevisComplet {
  id: number
  numero: string
  client_id: number
  statut: StatutDevis
  date_devis: string
  validite_jours: number
  objet: string | null
  remise_pct: number
  taux_tva: number
  total_ht: number
  total_tva: number
  total_ttc: number
  notes: string | null
  created_at: string
  lignes: LigneDevisEnBase[]
  client: Client
}

// Un devis envoyé dont la validité est dépassée s'affiche « expiré »
export function statutAffiche(d: Pick<DevisResume, 'statut' | 'date_devis' | 'validite_jours'>): StatutDevis {
  if (d.statut !== 'envoye' && d.statut !== 'brouillon') return d.statut
  const fin = new Date(d.date_devis)
  fin.setDate(fin.getDate() + d.validite_jours)
  return d.statut === 'envoye' && fin < new Date(new Date().toDateString()) ? 'expire' : d.statut
}

export function dateFinValidite(d: Pick<DevisResume, 'date_devis' | 'validite_jours'>): Date {
  const fin = new Date(d.date_devis)
  fin.setDate(fin.getDate() + d.validite_jours)
  return fin
}

const arrondi = (n: number) => Math.round(n * 100) / 100

// Même formule que recalculer_devis() côté base
export function calculerTotaux(totauxLignes: number[], remisePct: number, tauxTva: number) {
  const brut = arrondi(totauxLignes.reduce((s, t) => s + t, 0))
  const totalHt = arrondi(brut * (1 - remisePct / 100))
  const totalTva = arrondi((totalHt * tauxTva) / 100)
  return { brut, remise: arrondi(brut - totalHt), totalHt, totalTva, totalTtc: arrondi(totalHt + totalTva) }
}

function traduire(message: string, code?: string): string {
  if (code === '42501') return "Vous n'avez pas les droits pour cette action."
  if (code === '23503') return 'Ce devis est lié à une commande : il ne peut pas être supprimé.'
  if (code === 'PGRST202' || message.includes('enregistrer_devis')) {
    return 'La fonction enregistrer_devis est absente : exécutez sql/06_devis.sql dans Supabase.'
  }
  return message
}

export async function listerDevis(): Promise<DevisResume[]> {
  const { data, error } = await supabase
    .from('devis')
    .select('id, numero, statut, date_devis, validite_jours, objet, total_ht, total_ttc, client:clients(nom)')
    .order('id', { ascending: false })
  if (error) throw new Error(traduire(error.message, error.code))
  return (data ?? []) as unknown as DevisResume[]
}

export async function chargerDevis(id: number): Promise<DevisComplet> {
  const { data, error } = await supabase
    .from('devis')
    .select('*, client:clients(*), lignes:devis_lignes(*, finitions:devis_ligne_finitions(finition_id, quantite, montant, finition:finitions(nom)))')
    .eq('id', id)
    .order('ordre', { referencedTable: 'devis_lignes' })
    .single()
  if (error) throw new Error(error.code === 'PGRST116' ? 'Devis introuvable.' : traduire(error.message, error.code))
  return data as unknown as DevisComplet
}

// Données nécessaires à la saisie : clients actifs, produits et finitions
export async function chargerReferentielsDevis() {
  const [clients, produits, finitions] = await Promise.all([
    supabase.from('clients').select('*').eq('actif', true).order('nom'),
    // Tous les produits / finitions : un devis ancien peut en utiliser un désactivé depuis
    supabase.from('produits').select('*').order('nom'),
    supabase.from('finitions').select('*').order('nom'),
  ])
  const erreur = clients.error ?? produits.error ?? finitions.error
  if (erreur) throw new Error(traduire(erreur.message, erreur.code))
  return {
    clients: (clients.data ?? []) as Client[],
    produits: (produits.data ?? []) as Produit[],
    finitions: (finitions.data ?? []) as Finition[],
  }
}

export interface EnteteAEnregistrer {
  id: number | null
  client_id: number
  date_devis: string
  validite_jours: number
  objet: string
  remise_pct: number
  taux_tva: number
  notes: string
}

export interface LigneAEnregistrer {
  description: string
  technique: Technique
  produit_id: number | null
  quantite: number
  largeur_mm: number | null
  hauteur_mm: number | null
  detail_calcul: DetailCalcul
  prix_total_ht: number
  finitions: LigneFinitionEnBase[]
}

export async function enregistrerDevis(entete: EnteteAEnregistrer, lignes: LigneAEnregistrer[]): Promise<number> {
  const { data, error } = await supabase.rpc('enregistrer_devis', { p_devis: entete, p_lignes: lignes })
  if (error) throw new Error(traduire(error.message, error.code))
  return data as number
}

export async function changerStatut(id: number, statut: StatutDevis) {
  const { error } = await supabase.from('devis').update({ statut }).eq('id', id)
  if (error) throw new Error(traduire(error.message, error.code))
}

export async function supprimerDevis(id: number) {
  const { error } = await supabase.from('devis').delete().eq('id', id)
  if (error) throw new Error(traduire(error.message, error.code))
}
