import type { CategorieDepense } from './depenses'

// Détection automatique de la catégorie d'une dépense d'après son libellé
// (« Facture SOMELEC » → Électricité, « Gasoil livraison » → Carburant…).

export const normaliser = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

// Clé : morceau du nom de la catégorie ; valeurs : mots qui la désignent.
// Les catégories créées par le gérant sont aussi reconnues par les mots de leur nom.
const MOTS_CLES: [string, string[]][] = [
  ['salaire', ['salaire', 'paie', 'prime', 'employe', 'personnel']],
  ['loyer', ['loyer', 'bail', 'location du local']],
  ['electricite', ['electricite', 'somelec', 'courant electrique']],
  ['eau', ['eau', 'snde']],
  ['internet', ['internet', 'telephone', 'mauritel', 'chinguitel', 'mattel', 'wifi', 'forfait mobile', 'recharge']],
  ['carburant', ['carburant', 'essence', 'gasoil', 'gazoil', 'transport', 'taxi', 'course']],
  ['entretien', ['entretien', 'reparation', 'depannage', 'maintenance', 'technicien', 'piece de rechange']],
  ['sous-traitance', ['sous-traitance', 'sous traitance', 'sous-traitant']],
  ['impot', ['impot', 'taxe', 'patente', 'dgi', 'cnss', 'amende']],
  ['banque', ['banque', 'bancaire', 'agios', 'commission', 'frais de tenue']],
  ['equipement', ['equipement', 'materiel', 'ordinateur', 'imprimante', 'machine', 'mobilier', 'climatiseur', 'outil']],
]

// Le mot doit commencer un mot du libellé (« eau » ne doit pas trouver « bureau »)
const contientMot = (texte: string, mot: string) => new RegExp(`(^|[^a-z0-9])${mot.replace(/[-\s]/g, '[-\\s]?')}`).test(texte)

export function detecterCategorie(libelle: string, categories: CategorieDepense[]): CategorieDepense | null {
  const texte = normaliser(libelle)
  if (texte.trim().length < 3) return null
  for (const c of categories) {
    if (!c.actif || c.achat_stock) continue
    const nom = normaliser(c.nom)
    const synonymes = MOTS_CLES.filter(([cle]) => nom.includes(cle)).flatMap(([, mots]) => mots)
    const motsDuNom = nom.split(/[^a-z0-9]+/).filter((m) => m.length >= 5)
    if ([...synonymes, ...motsDuNom].some((m) => contientMot(texte, m))) return c
  }
  return null
}

/** Catégorie par défaut d'une dépense simple : « Divers », sinon la première qui n'est pas un achat */
export function categorieParDefaut(categories: CategorieDepense[]): CategorieDepense | undefined {
  const actives = categories.filter((c) => c.actif && !c.achat_stock)
  return actives.find((c) => normaliser(c.nom).startsWith('divers')) ?? actives[0]
}
