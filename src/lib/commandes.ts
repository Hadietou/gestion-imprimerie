import { supabase } from './supabase'
import type { Client, Technique } from './types'

// Commandes, BAT et production (imprimerie_schema.sql + sql/08_commandes.sql).
// Les statuts de commande suivent automatiquement les BAT et l'atelier (déclencheurs SQL).

export type StatutCommande = 'attente_bat' | 'bat_envoye' | 'bat_valide' | 'en_production' | 'termine' | 'livre' | 'annule'
export type StatutProduction = 'a_faire' | 'en_cours' | 'termine' | 'bloque'
export type StatutBat = 'envoye' | 'valide' | 'refuse'

export const LIBELLES_STATUTS_COMMANDE: Record<StatutCommande, string> = {
  attente_bat: 'BAT à faire',
  bat_envoye: 'BAT envoyé',
  bat_valide: 'Prête à produire',
  en_production: 'En production',
  termine: 'Terminée',
  livre: 'Livrée',
  annule: 'Annulée',
}

export const LIBELLES_STATUTS_PRODUCTION: Record<StatutProduction, string> = {
  a_faire: 'À faire',
  en_cours: 'En cours',
  termine: 'Terminé',
  bloque: 'Bloqué',
}

// Étapes affichées dans le suivi de la commande
export const ETAPES_COMMANDE: StatutCommande[] = ['attente_bat', 'bat_envoye', 'bat_valide', 'en_production', 'termine', 'livre']

export interface CommandeResume {
  id: number
  numero: string
  statut: StatutCommande
  date_commande: string
  date_livraison_prevue: string | null
  urgent: boolean
  objet: string | null
  remise_pct: number
  taux_tva: number
  client: { nom: string } | null
  lignes: { prix_total_ht: number }[]
}

export interface LigneCommande {
  id: number
  description: string
  technique: Technique
  quantite: number
  prix_total_ht: number
  statut_production: StatutProduction
  priorite: number
  instructions: string | null
  machine_id: number | null
  debut_production: string | null
  fin_production: string | null
  operateur: { nom_complet: string } | null
}

export interface Bat {
  id: number
  version: number
  lien_fichier: string | null
  statut: StatutBat
  commentaire_client: string | null
  date_envoi: string
  date_reponse: string | null
}

export interface Commande {
  id: number
  numero: string
  devis_id: number | null
  client_id: number
  statut: StatutCommande
  date_commande: string
  date_livraison_prevue: string | null
  date_livraison_reelle: string | null
  urgent: boolean
  acompte: number
  objet: string | null
  remise_pct: number
  taux_tva: number
  notes: string | null
  client: Client
  devis: { numero: string } | null
  lignes: LigneCommande[]
  bats: Bat[]
}

/** Travail de la file de production (une ligne de commande) */
export interface Travail extends LigneCommande {
  commande: {
    id: number
    numero: string
    statut: StatutCommande
    urgent: boolean
    date_livraison_prevue: string | null
    client: { nom: string } | null
  }
  machine: { nom: string } | null
}

function traduire(message: string, code?: string): string {
  if (code === '42501' || message.includes('row-level security')) return "Vous n'avez pas les droits pour cette action."
  if (code === '23505') return 'Ce devis a déjà une commande en cours.'
  if (code === '23503') return 'Cette commande est liée à une facture : annulez-la plutôt que de la supprimer.'
  if (code === 'PGRST202' || code === '42703') return 'Le module Commandes n’est pas installé : exécutez sql/08_commandes.sql dans Supabase.'
  return message
}

const SELECT_LISTE =
  'id, numero, statut, date_commande, date_livraison_prevue, urgent, objet, remise_pct, taux_tva, client:clients(nom), lignes:commande_lignes(prix_total_ht)'

export async function listerCommandes(): Promise<CommandeResume[]> {
  const { data, error } = await supabase.from('commandes').select(SELECT_LISTE).order('id', { ascending: false }).limit(500)
  if (error) throw new Error(traduire(error.message, error.code))
  return (data ?? []) as unknown as CommandeResume[]
}

export async function chargerCommande(id: number): Promise<Commande> {
  const { data, error } = await supabase
    .from('commandes')
    .select(
      '*, client:clients(*), devis:devis(numero), lignes:commande_lignes(*, operateur:profils(nom_complet)), bats:bat(*)',
    )
    .eq('id', id)
    .order('id', { referencedTable: 'commande_lignes' })
    .order('version', { referencedTable: 'bat', ascending: false })
    .single()
  if (error) throw new Error(error.code === 'PGRST116' ? 'Commande introuvable.' : traduire(error.message, error.code))
  return data as unknown as Commande
}

/** Commande liée à un devis (la plus récente non annulée), ou null */
export async function commandeDuDevis(devisId: number): Promise<{ id: number; numero: string } | null> {
  const { data } = await supabase
    .from('commandes')
    .select('id, numero')
    .eq('devis_id', devisId)
    .neq('statut', 'annule')
    .maybeSingle()
  return (data as { id: number; numero: string } | null) ?? null
}

export async function creerCommandeDepuisDevis(devisId: number, dateLivraison: string | null, urgent: boolean): Promise<number> {
  const { data, error } = await supabase.rpc('creer_commande_depuis_devis', {
    p_devis_id: devisId,
    p_date_livraison: dateLivraison || null,
    p_urgent: urgent,
  })
  if (error) throw new Error(traduire(error.message, error.code))
  return data as number
}

export async function modifierCommande(
  id: number,
  champs: Partial<Pick<Commande, 'statut' | 'date_livraison_prevue' | 'date_livraison_reelle' | 'urgent' | 'acompte' | 'notes'>>,
) {
  const { error } = await supabase.from('commandes').update(champs).eq('id', id)
  if (error) throw new Error(traduire(error.message, error.code))
}

export async function envoyerBat(commandeId: number, version: number, lien: string) {
  const { error } = await supabase.from('bat').insert({ commande_id: commandeId, version, lien_fichier: lien || null })
  if (error) throw new Error(traduire(error.message, error.code))
}

export async function repondreBat(batId: number, statut: 'valide' | 'refuse', commentaire: string) {
  const { error } = await supabase
    .from('bat')
    .update({ statut, commentaire_client: commentaire || null, date_reponse: new Date().toISOString() })
    .eq('id', batId)
  if (error) throw new Error(traduire(error.message, error.code))
}

// ---------------------------------------------------------------- Production

export async function listerProduction(): Promise<Travail[]> {
  const { data, error } = await supabase
    .from('commande_lignes')
    .select(
      '*, operateur:profils(nom_complet), machine:machines(nom), commande:commandes!inner(id, numero, statut, urgent, date_livraison_prevue, client:clients(nom))',
    )
    .in('commande.statut', ['bat_valide', 'en_production'])
    .neq('statut_production', 'termine')
  if (error) throw new Error(traduire(error.message, error.code))
  return (data ?? []) as unknown as Travail[]
}

export async function changerStatutProduction(ligneId: number, statut: StatutProduction, operateurId: string | null) {
  const maintenant = new Date().toISOString()
  const champs: Record<string, unknown> = { statut_production: statut }
  if (statut === 'en_cours') {
    champs.debut_production = maintenant
    champs.operateur_id = operateurId
  }
  if (statut === 'termine') champs.fin_production = maintenant
  const { error } = await supabase.from('commande_lignes').update(champs).eq('id', ligneId)
  if (error) throw new Error(traduire(error.message, error.code))
}

export async function affecterMachine(ligneId: number, machineId: number | null) {
  const { error } = await supabase.from('commande_lignes').update({ machine_id: machineId }).eq('id', ligneId)
  if (error) throw new Error(traduire(error.message, error.code))
}

/** Total TTC d'une commande à partir de ses lignes (même formule que les devis) */
export function totalCommande(lignes: { prix_total_ht: number }[], remisePct: number, tauxTva: number) {
  const brut = lignes.reduce((s, l) => s + Number(l.prix_total_ht), 0)
  const ht = Math.round(brut * (1 - remisePct / 100) * 100) / 100
  const tva = Math.round(((ht * tauxTva) / 100) * 100) / 100
  return { brut, ht, tva, ttc: Math.round((ht + tva) * 100) / 100 }
}

/** Livraison prévue dépassée pour une commande ni livrée ni annulée */
export function enRetard(c: { statut: StatutCommande; date_livraison_prevue: string | null }): boolean {
  const aujourdhui = new Date().toISOString().slice(0, 10)
  return Boolean(c.date_livraison_prevue && c.date_livraison_prevue < aujourdhui && c.statut !== 'livre' && c.statut !== 'annule')
}
