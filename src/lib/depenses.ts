import { supabase } from './supabase'
import type { UniteSupport } from './types'

// Dépenses de fonctionnement (sql/07_depenses.sql)

export type ModePaiement = 'especes' | 'virement' | 'cheque' | 'mobile_money' | 'carte' | 'autre'

export const LIBELLES_MODES_PAIEMENT: Record<ModePaiement, string> = {
  especes: 'Espèces',
  mobile_money: 'Mobile money (Bankily, Masrvi…)',
  virement: 'Virement',
  cheque: 'Chèque',
  carte: 'Carte bancaire',
  autre: 'Autre',
}

export interface CategorieDepense {
  id: number
  nom: string
  achat_stock: boolean
  ordre: number
  actif: boolean
}

export interface EntreeStock {
  id: number
  support_id: number
  quantite: number
  support: { nom: string; unite: UniteSupport } | null
}

export interface Depense {
  id: number
  date_depense: string
  categorie_id: number
  libelle: string
  montant: number
  mode: ModePaiement
  beneficiaire: string | null
  reference: string | null
  notes: string | null
  categorie: { nom: string; achat_stock: boolean } | null
  entrees: EntreeStock[]
}

export interface ArticleAchete {
  support_id: number
  quantite: number
  prix_unitaire: number
}

function traduire(message: string, code?: string): string {
  if (code === '42501') return "Vous n'avez pas les droits pour cette action."
  if (code === '23503') {
    return 'Cette dépense a fait entrer des articles en stock : elle ne peut pas être supprimée (corrigez le stock par un ajustement).'
  }
  // Fonction ou table absente : le script SQL n'a pas été exécuté
  if (code === 'PGRST202' || code === 'PGRST205' || code === '42P01') {
    return 'Le module Dépenses n’est pas installé : exécutez sql/07_depenses.sql dans Supabase.'
  }
  return message
}

/** Dépenses d'un mois (mois au format AAAA-MM) */
export async function listerDepenses(mois: string): Promise<Depense[]> {
  const [annee, m] = mois.split('-').map(Number)
  const debut = `${mois}-01`
  const fin = new Date(Date.UTC(annee, m, 1)).toISOString().slice(0, 10)
  const { data, error } = await supabase
    .from('depenses')
    .select('*, categorie:categories_depense(nom, achat_stock), entrees:mouvements_stock(id, support_id, quantite, support:supports(nom, unite))')
    .gte('date_depense', debut)
    .lt('date_depense', fin)
    .order('date_depense', { ascending: false })
    .order('id', { ascending: false })
  if (error) throw new Error(traduire(error.message, error.code))
  return (data ?? []) as unknown as Depense[]
}

export async function listerCategories(): Promise<CategorieDepense[]> {
  const { data, error } = await supabase.from('categories_depense').select('*').order('ordre').order('nom')
  if (error) throw new Error(traduire(error.message, error.code))
  return (data ?? []) as CategorieDepense[]
}

export interface DepenseAEnregistrer {
  id: number | null
  date_depense: string
  categorie_id: number
  libelle: string
  montant: number
  mode: ModePaiement
  beneficiaire: string
  reference: string
  notes: string
}

export async function enregistrerDepense(depense: DepenseAEnregistrer, articles: ArticleAchete[]): Promise<number> {
  const { data, error } = await supabase.rpc('enregistrer_depense', { p_depense: depense, p_articles: articles })
  if (error) throw new Error(traduire(error.message, error.code))
  return data as number
}

export async function supprimerDepense(id: number) {
  const { error } = await supabase.from('depenses').delete().eq('id', id)
  if (error) throw new Error(traduire(error.message, error.code))
}

/** Libellés déjà utilisés, par catégorie (les plus récents d'abord) : la « liste des articles » d'une catégorie de frais */
export async function listerLibellesParCategorie(): Promise<Map<number, string[]>> {
  const { data, error } = await supabase
    .from('depenses')
    .select('categorie_id, libelle')
    .order('date_depense', { ascending: false })
    .limit(1000)
  if (error) throw new Error(traduire(error.message, error.code))
  const parCategorie = new Map<number, string[]>()
  for (const { categorie_id, libelle } of (data ?? []) as { categorie_id: number; libelle: string }[]) {
    const liste = parCategorie.get(categorie_id) ?? []
    if (!liste.some((l) => l.toLowerCase() === libelle.toLowerCase())) liste.push(libelle)
    parCategorie.set(categorie_id, liste)
  }
  return parCategorie
}
