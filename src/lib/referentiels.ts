import { supabase } from './supabase'

// Accès générique aux tables de référence (machines, supports, finitions, puis clients…)
// Chaque ligne a un id numérique, un nom et un indicateur actif.

export type TableReferentiel = 'machines' | 'supports' | 'finitions'

export interface LigneReferentiel {
  id: number
  nom: string
  actif: boolean
}

function traduire(message: string, code?: string): string {
  if (code === '23503') {
    return 'Cet élément est utilisé dans des devis ou commandes : désactivez-le plutôt que de le supprimer.'
  }
  if (code === '42501' || message.includes('row-level security')) {
    return "Vous n'avez pas les droits pour cette modification."
  }
  return message
}

export async function lister<T extends LigneReferentiel>(table: TableReferentiel): Promise<T[]> {
  const { data, error } = await supabase.from(table).select('*').order('nom')
  if (error) throw new Error(traduire(error.message, error.code))
  return (data ?? []) as T[]
}

export async function enregistrer(table: TableReferentiel, id: number | null, valeurs: Record<string, unknown>) {
  const requete = id === null ? supabase.from(table).insert(valeurs) : supabase.from(table).update(valeurs).eq('id', id)
  const { error } = await requete
  if (error) throw new Error(traduire(error.message, error.code))
}

export async function supprimer(table: TableReferentiel, id: number) {
  const { error } = await supabase.from(table).delete().eq('id', id)
  if (error) throw new Error(traduire(error.message, error.code))
}
