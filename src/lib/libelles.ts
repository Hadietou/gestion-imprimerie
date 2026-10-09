import type { CategorieSupport, ModeCalculFinition, Technique, UniteSupport } from './types'

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

export function options<T extends string>(libelles: Record<T, string>) {
  return (Object.keys(libelles) as T[]).map((valeur) => ({ valeur, libelle: libelles[valeur] }))
}
