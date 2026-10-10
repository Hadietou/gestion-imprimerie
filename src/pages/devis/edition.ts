import type { DevisComplet, LigneAEnregistrer, LigneDevisEnBase } from '../../lib/devis'
import { auM2, auMetre, montantFinition, prixProduitLigne } from '../../lib/tarifs'
import type { Finition, Produit, Technique } from '../../lib/types'

// État d'une ligne pendant la saisie d'un devis.
// Les prix sont stockés dans l'état et recalculés seulement quand la ligne
// change : un devis existant garde ses prix même si la grille a évolué.

export interface FinitionLigne {
  finition_id: number
  montant: number
}

export interface LigneEdition {
  cle: string
  produit_id: number | null
  technique: Technique
  description: string
  quantite: string
  /** Dimensions saisies en cm (stockées en mm) */
  largeur_cm: string
  hauteur_cm: string
  prix_produit: number
  detail: string
  finitions: FinitionLigne[]
  /** Prix total HT saisi à la main (null = prix calculé). Toujours saisi pour une ligne libre. */
  prix_force: string | null
}

export const versNombre = (s: string) => Number(String(s).replace(',', '.').replace(/\s/g, ''))
const versTexte = (n: number | null | undefined) => (n == null ? '' : String(n).replace('.', ','))
const nouvelleCle = () => Math.random().toString(36).slice(2)
const arrondi = (n: number) => Math.round(n * 100) / 100

export function ligneVide(): LigneEdition {
  return {
    cle: nouvelleCle(),
    produit_id: null,
    technique: 'numerique',
    description: '',
    quantite: '1',
    largeur_cm: '',
    hauteur_cm: '',
    prix_produit: 0,
    detail: '',
    finitions: [],
    prix_force: null,
  }
}

export function totalLigne(l: LigneEdition): number {
  if (l.prix_force !== null) {
    const n = versNombre(l.prix_force)
    return Number.isFinite(n) ? arrondi(n) : 0
  }
  return arrondi(l.prix_produit + l.finitions.reduce((s, f) => s + f.montant, 0))
}

const mm = (cm: string) => {
  const n = versNombre(cm)
  return n > 0 ? Math.round(n * 10) : null
}

/** Recalcule prix du produit et montants des finitions d'après la grille */
export function recalculer(l: LigneEdition, produits: Produit[], finitions: Finition[]): LigneEdition {
  const produit = produits.find((p) => p.id === l.produit_id)
  const quantite = versNombre(l.quantite)
  const largeur = mm(l.largeur_cm)
  const hauteur = mm(l.hauteur_cm)
  const surfaceTotale = largeur && hauteur && quantite > 0 ? ((largeur * hauteur) / 1e6) * quantite : 0

  let prix_produit = l.prix_produit
  let detail = l.detail
  if (produit) {
    const resultat = prixProduitLigne(produit, quantite, largeur, hauteur)
    prix_produit = resultat?.total ?? 0
    detail =
      resultat?.detail ??
      (auM2(produit.mode_prix)
        ? 'Indiquez la largeur et la hauteur.'
        : auMetre(produit.mode_prix)
          ? 'Indiquez la longueur.'
          : 'Indiquez la quantité.')
  }

  return {
    ...l,
    prix_produit,
    detail,
    finitions: l.finitions.map((f) => {
      const def = finitions.find((x) => x.id === f.finition_id)
      return def && quantite > 0 ? { ...f, montant: montantFinition(def, quantite, surfaceTotale) } : f
    }),
  }
}

/** Choix d'un produit : description, technique et prix repris de la grille */
export function appliquerProduit(l: LigneEdition, produit: Produit | null, produits: Produit[], finitions: Finition[]): LigneEdition {
  if (!produit) {
    // Ligne libre : prix saisi à la main
    return { ...l, produit_id: null, prix_force: l.prix_force ?? versTexte(totalLigne(l)), detail: '' }
  }
  const description = [produit.nom, produit.description].filter(Boolean).join('\n')
  return recalculer(
    {
      ...l,
      produit_id: produit.id,
      technique: produit.technique,
      description,
      prix_force: null,
      // Les finitions d'une autre technique ne s'appliquent plus
      finitions: l.finitions.filter((f) => finitions.find((x) => x.id === f.finition_id)?.techniques.includes(produit.technique)),
    },
    produits,
    finitions,
  )
}

/** Ligne enregistrée → ligne éditable, SANS recalcul (prix figés) */
export function depuisBase(l: LigneDevisEnBase): LigneEdition {
  const totalFinitions = l.finitions.reduce((s, f) => s + Number(f.montant), 0)
  const libre = l.produit_id === null
  return {
    cle: nouvelleCle(),
    produit_id: l.produit_id,
    technique: l.technique,
    description: l.description,
    quantite: String(l.quantite),
    largeur_cm: l.largeur_mm ? versTexte(l.largeur_mm / 10) : '',
    hauteur_cm: l.hauteur_mm ? versTexte(l.hauteur_mm / 10) : '',
    prix_produit: l.detail_calcul?.prix_produit ?? arrondi(l.prix_total_ht - totalFinitions),
    detail: l.detail_calcul?.detail ?? '',
    finitions: l.finitions.map((f) => ({ finition_id: f.finition_id, montant: Number(f.montant) })),
    prix_force: libre || l.detail_calcul?.prix_force ? versTexte(l.prix_total_ht) : null,
  }
}

export function lignesDepuisDevis(d: DevisComplet): LigneEdition[] {
  return [...d.lignes].sort((a, b) => a.ordre - b.ordre).map(depuisBase)
}

/** Contrôle d'une ligne avant enregistrement (message d'erreur ou null) */
export function erreurLigne(l: LigneEdition, produits: Produit[]): string | null {
  const q = versNombre(l.quantite)
  if (!l.description.trim()) return 'La désignation est obligatoire.'
  if (!Number.isInteger(q) || q < 1) return 'La quantité doit être un nombre entier d’au moins 1.'
  const produit = produits.find((p) => p.id === l.produit_id)
  if (produit && auM2(produit.mode_prix) && !(mm(l.largeur_cm) && mm(l.hauteur_cm))) return 'Indiquez la largeur et la hauteur.'
  if (produit && auMetre(produit.mode_prix) && !mm(l.hauteur_cm)) return 'Indiquez la longueur.'
  if (l.prix_force !== null) {
    const n = versNombre(l.prix_force)
    if (!Number.isFinite(n) || n < 0) return 'Le prix saisi n’est pas valide.'
  }
  return null
}

export function versEnregistrement(l: LigneEdition): LigneAEnregistrer {
  const forcee = l.prix_force !== null
  return {
    description: l.description.trim(),
    technique: l.technique,
    produit_id: l.produit_id,
    quantite: versNombre(l.quantite),
    largeur_mm: mm(l.largeur_cm),
    hauteur_mm: mm(l.hauteur_cm),
    detail_calcul: { prix_produit: l.prix_produit, detail: l.detail, prix_force: forcee && l.produit_id !== null },
    prix_total_ht: totalLigne(l),
    // Prix saisi à la main : il remplace aussi les finitions, qu'on garde pour l'atelier à 0
    finitions: l.finitions.map((f) => ({ finition_id: f.finition_id, quantite: 1, montant: forcee ? 0 : f.montant })),
  }
}
