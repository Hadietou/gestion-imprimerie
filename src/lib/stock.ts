import { supabase } from './supabase'
import type { Support } from './types'

// Stock des papiers, supports, encres et consommables.
// Toute variation passe par un mouvement (table mouvements_stock) ; le
// déclencheur appliquer_mouvement_stock met à jour supports.stock_actuel.
// Les mouvements ne sont jamais modifiés ni supprimés (traçabilité).

export type TypeMouvement = 'entree' | 'sortie' | 'ajustement'

export const LIBELLES_MOUVEMENTS: Record<TypeMouvement, string> = {
  entree: 'Entrée',
  sortie: 'Sortie',
  ajustement: 'Ajustement (inventaire)',
}

export interface Mouvement {
  id: number
  support_id: number
  type: TypeMouvement
  quantite: number
  motif: string | null
  depense_id: number | null
  created_at: string
  profil: { nom_complet: string } | null
}

/** Variation réelle du stock : + pour une entrée, − pour une sortie, signée pour un ajustement */
export function variation(m: Pick<Mouvement, 'type' | 'quantite'>): number {
  const q = Number(m.quantite)
  return m.type === 'entree' ? Math.abs(q) : m.type === 'sortie' ? -Math.abs(q) : q
}

export const enAlerte = (s: Pick<Support, 'stock_actuel' | 'seuil_alerte'>) =>
  s.seuil_alerte > 0 && Number(s.stock_actuel) <= Number(s.seuil_alerte)

function traduire(message: string, code?: string): string {
  if (code === '42501' || message.includes('row-level security')) return "Vous n'avez pas les droits pour cette action."
  return message
}

export async function listerArticles(): Promise<Support[]> {
  const { data, error } = await supabase.from('supports').select('*').order('nom')
  if (error) throw new Error(traduire(error.message, error.code))
  return (data ?? []) as Support[]
}

export async function chargerArticle(id: number): Promise<{ article: Support; mouvements: Mouvement[] }> {
  const [article, mouvements] = await Promise.all([
    supabase.from('supports').select('*').eq('id', id).single(),
    supabase
      .from('mouvements_stock')
      .select('id, support_id, type, quantite, motif, depense_id, created_at, profil:profils(nom_complet)')
      .eq('support_id', id)
      .order('created_at', { ascending: false })
      .limit(200),
  ])
  const erreur = article.error ?? mouvements.error
  if (erreur) throw new Error(erreur.code === 'PGRST116' ? 'Article introuvable.' : traduire(erreur.message, erreur.code))
  return { article: article.data as Support, mouvements: (mouvements.data ?? []) as unknown as Mouvement[] }
}

export async function enregistrerMouvement(m: { support_id: number; type: TypeMouvement; quantite: number; motif: string }) {
  const { error } = await supabase.from('mouvements_stock').insert(m)
  if (error) throw new Error(traduire(error.message, error.code))
}
