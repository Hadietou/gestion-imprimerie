import type { ModePaiement } from './depenses'
import { supabase } from './supabase'
import type { Client, Technique } from './types'

// Factures et paiements (imprimerie_schema.sql + sql/09_factures.sql).
// Une facture naît d'une commande ; ses produits sont les lignes de la commande.
// total_tva / total_ttc sont calculés par la base ; montant_paye et statut suivent les paiements.

export type StatutFacture = 'brouillon' | 'emise' | 'partiellement_payee' | 'payee' | 'annulee'

export const LIBELLES_STATUTS_FACTURE: Record<StatutFacture, string> = {
  brouillon: 'Brouillon',
  emise: 'À payer',
  partiellement_payee: 'Payée en partie',
  payee: 'Payée',
  annulee: 'Annulée',
}

export interface Paiement {
  id: number
  date_paiement: string
  montant: number
  mode: ModePaiement
  reference: string | null
}

export interface FactureResume {
  id: number
  numero: string
  statut: StatutFacture
  date_facture: string
  date_echeance: string | null
  total_ht: number
  total_ttc: number
  montant_paye: number
  client: { nom: string } | null
}

export interface LigneFacture {
  id: number
  description: string
  technique: Technique
  quantite: number
  prix_total_ht: number
}

export interface Facture {
  id: number
  numero: string
  commande_id: number | null
  client_id: number
  statut: StatutFacture
  date_facture: string
  date_echeance: string | null
  total_ht: number
  taux_tva: number
  total_tva: number
  total_ttc: number
  montant_paye: number
  /** Objet (repris de la commande) */
  notes: string | null
  client: Client
  commande: {
    numero: string
    remise_pct: number
    devis: { numero: string } | null
    lignes: LigneFacture[]
  } | null
  paiements: Paiement[]
}

export interface Impaye {
  id: number
  numero: string
  client: string
  telephone: string | null
  date_facture: string
  date_echeance: string | null
  total_ttc: number
  montant_paye: number
  reste_a_payer: number
  jours_retard: number
}

/** Montant dû : TTC si la facture a de la TVA, sinon HT (identiques dans ce cas) */
export const resteAPayer = (f: Pick<FactureResume, 'total_ttc' | 'montant_paye'>) =>
  Math.max(Math.round((Number(f.total_ttc) - Number(f.montant_paye)) * 100) / 100, 0)

function traduire(message: string, code?: string): string {
  if (code === '42501' || message.includes('row-level security')) return "Vous n'avez pas les droits pour cette action."
  if (code === 'PGRST202') return 'Le module Factures n’est pas installé : exécutez sql/09_factures.sql dans Supabase.'
  if (code === '23514') return 'Le montant doit être supérieur à 0.'
  return message
}

export async function listerFactures(): Promise<FactureResume[]> {
  const { data, error } = await supabase
    .from('factures')
    .select('id, numero, statut, date_facture, date_echeance, total_ht, total_ttc, montant_paye, client:clients(nom)')
    .order('id', { ascending: false })
    .limit(500)
  if (error) throw new Error(traduire(error.message, error.code))
  return (data ?? []) as unknown as FactureResume[]
}

export async function chargerFacture(id: number): Promise<Facture> {
  const { data, error } = await supabase
    .from('factures')
    .select(
      '*, client:clients(*), paiements(id, date_paiement, montant, mode, reference), commande:commandes(numero, remise_pct, devis:devis(numero), lignes:commande_lignes(id, description, technique, quantite, prix_total_ht))',
    )
    .eq('id', id)
    .order('date_paiement', { referencedTable: 'paiements' })
    .single()
  if (error) throw new Error(error.code === 'PGRST116' ? 'Facture introuvable.' : traduire(error.message, error.code))
  const facture = data as unknown as Facture
  facture.commande?.lignes.sort((a, b) => a.id - b.id)
  return facture
}

/** Facture active d'une commande (non annulée), ou null */
export async function factureDeCommande(commandeId: number): Promise<{ id: number; numero: string } | null> {
  const { data } = await supabase
    .from('factures')
    .select('id, numero')
    .eq('commande_id', commandeId)
    .neq('statut', 'annulee')
    .maybeSingle()
  return (data as { id: number; numero: string } | null) ?? null
}

export async function creerFactureDepuisCommande(commandeId: number): Promise<number> {
  const { data, error } = await supabase.rpc('creer_facture_depuis_commande', { p_commande_id: commandeId })
  if (error) throw new Error(traduire(error.message, error.code))
  return data as number
}

export async function enregistrerPaiement(p: { facture_id: number; date_paiement: string; montant: number; mode: ModePaiement; reference: string }) {
  const { error } = await supabase.from('paiements').insert({ ...p, reference: p.reference.trim() || null })
  if (error) throw new Error(traduire(error.message, error.code))
}

export async function supprimerPaiement(id: number) {
  const { error } = await supabase.from('paiements').delete().eq('id', id)
  if (error) throw new Error(traduire(error.message, error.code))
}

export async function annulerFacture(id: number) {
  const { error } = await supabase.from('factures').update({ statut: 'annulee' }).eq('id', id)
  if (error) throw new Error(traduire(error.message, error.code))
}

export async function listerImpayes(): Promise<Impaye[]> {
  const { data, error } = await supabase.from('v_impayes').select('*').order('jours_retard', { ascending: false })
  if (error) throw new Error(traduire(error.message, error.code))
  return (data ?? []) as Impaye[]
}
