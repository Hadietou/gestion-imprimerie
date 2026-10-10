import type { CategorieSupport, ModeCalculFinition, ModePrix, Technique, UniteSupport } from './types'

// Libellés français des listes de valeurs (types ENUM du schéma SQL)

export const LIBELLES_TECHNIQUES: Record<Technique, string> = {
  numerique: 'Numérique',
  offset: 'Offset',
  grand_format: 'Grand format',
  serigraphie: 'Sérigraphie',
}

export const LIBELLES_CATEGORIES_SUPPORT: Record<CategorieSupport, string> = {
  papier: 'Papier',
  vinyle: 'Vinyle / adhésif',
  bache: 'Bâche',
  textile: 'Textile',
  rigide: 'Support rigide',
  autre: 'Autre',
}

export const LIBELLES_UNITES: Record<UniteSupport, string> = {
  feuille: 'feuille',
  m2: 'm²',
  metre_lineaire: 'mètre linéaire',
  piece: 'pièce',
}

export const LIBELLES_MODES_CALCUL: Record<ModeCalculFinition, string> = {
  forfait: 'Forfait par travail',
  par_unite: 'Par exemplaire',
  par_m2: 'Au m²',
  par_mille: 'Au mille (1 000 ex.)',
}

export const LIBELLES_MODES_PRIX: Record<ModePrix, string> = {
  par_lot: 'Par lot (prix par quantité)',
  par_unite: 'À l’unité',
  par_m2: 'Au m²',
  par_metre_lineaire: 'Au mètre linéaire',
  par_mille: 'Au mille',
  forfait: 'Forfait',
}

// Unité dans laquelle s'exprime la quantité, selon le mode de prix
export const UNITES_MODE_PRIX: Record<ModePrix, string> = {
  par_lot: 'ex.',
  par_unite: 'ex.',
  par_m2: 'm²',
  par_metre_lineaire: 'm',
  par_mille: 'ex.',
  forfait: '',
}

export function options<T extends string>(libelles: Record<T, string>) {
  return (Object.keys(libelles) as T[]).map((valeur) => ({ valeur, libelle: libelles[valeur] }))
}
