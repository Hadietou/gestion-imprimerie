import type { Finition, ModePrix, Palier, Produit } from './types'

// Calcul du prix de vente d'un produit pour une quantité, d'après sa grille.
// La quantité s'exprime dans l'unité du mode : exemplaires, m² ou mètres.

export interface ResultatPrix {
  total: number
  /** Explication lisible du calcul, reprise dans le devis */
  detail: string
  /** Quantité réellement facturée (après minimum) */
  quantiteFacturee: number
}

type Grille = Pick<Produit, 'mode_prix' | 'prix' | 'quantite_minimum' | 'paliers'>

const arrondi = (n: number) => Math.round(n * 100) / 100
const nombre = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 2 })

export function trierPaliers(paliers: Palier[]): Palier[] {
  return [...paliers].sort((a, b) => a.quantite - b.quantite)
}

export const utilisePaliersLot = (mode: ModePrix) => mode === 'par_lot'
export const utiliseQuantite = (mode: ModePrix) => mode !== 'forfait'

export function calculerPrix(grille: Grille, quantite: number, unite = ''): ResultatPrix | null {
  const u = unite ? ` ${unite}` : ''
  const paliers = trierPaliers(grille.paliers)

  switch (grille.mode_prix) {
    case 'forfait':
      return { total: arrondi(grille.prix), detail: 'Forfait', quantiteFacturee: 1 }

    case 'par_lot': {
      if (paliers.length === 0 || quantite <= 0) return null
      // On facture le plus petit lot qui couvre la quantité demandée
      const lot = paliers.find((p) => p.quantite >= quantite)
      if (lot) {
        return { total: arrondi(lot.prix), detail: `Lot de ${nombre(lot.quantite)}${u}`, quantiteFacturee: lot.quantite }
      }
      // Au-delà du plus grand lot : au prorata de son prix unitaire
      const dernier = paliers[paliers.length - 1]
      return {
        total: arrondi((quantite * dernier.prix) / dernier.quantite),
        detail: `Au prorata du lot de ${nombre(dernier.quantite)}${u}`,
        quantiteFacturee: quantite,
      }
    }

    default: {
      if (quantite <= 0) return null
      const facturee = Math.max(quantite, grille.quantite_minimum)
      // Prix unitaire : prix de base, remplacé par le dernier palier atteint
      let prixUnitaire = grille.prix
      let palierAtteint: Palier | undefined
      for (const p of paliers) {
        if (facturee >= p.quantite) {
          prixUnitaire = p.prix
          palierAtteint = p
        }
      }
      const parMille = grille.mode_prix === 'par_mille'
      const total = parMille ? (facturee / 1000) * prixUnitaire : facturee * prixUnitaire
      const parties = [
        `${nombre(facturee)}${u} × ${nombre(prixUnitaire)}${parMille ? ' le mille' : ''}`,
        facturee > quantite && `minimum facturé ${nombre(grille.quantite_minimum)}${u}`,
        palierAtteint && `tarif dès ${nombre(palierAtteint.quantite)}${u}`,
      ]
      return { total: arrondi(total), detail: parties.filter(Boolean).join(' — '), quantiteFacturee: facturee }
    }
  }
}

// ---------------------------------------------------------------------------
// Lignes de devis

export const auM2 = (mode: ModePrix) => mode === 'par_m2'
export const auMetre = (mode: ModePrix) => mode === 'par_metre_lineaire'

/**
 * Prix du produit pour une ligne : quantite exemplaires, dimensions en mm.
 * Au m² / au mètre, le minimum facturé s'applique à CHAQUE pièce
 * (une bâche de 0,5 m² est facturée 1 m²), les paliers sur la quantité totale.
 */
export function prixProduitLigne(
  produit: Grille,
  quantite: number,
  largeurMm: number | null,
  hauteurMm: number | null,
): ResultatPrix | null {
  if (!(quantite > 0)) return null
  const mode = produit.mode_prix

  if (auM2(mode) || auMetre(mode)) {
    const mesure = auM2(mode)
      ? ((largeurMm ?? 0) * (hauteurMm ?? 0)) / 1e6 // m² d'une pièce
      : (hauteurMm ?? 0) / 1000 // longueur d'une pièce en m
    if (!(mesure > 0)) return null
    const mesureFacturee = Math.max(mesure, produit.quantite_minimum)
    const unite = auM2(mode) ? 'm²' : 'm'
    const resultat = calculerPrix({ ...produit, quantite_minimum: 0 }, mesureFacturee * quantite, unite)
    if (!resultat) return null
    const parPiece = `${quantite} × ${nombre(mesureFacturee)} ${unite}${mesureFacturee > mesure ? ' (minimum)' : ''}`
    return { ...resultat, detail: `${parPiece} — ${resultat.detail}` }
  }

  return calculerPrix(produit, quantite, mode === 'forfait' ? '' : 'ex.')
}

/** Montant d'une finition pour une ligne (surface totale en m², 0 si inconnue) */
export function montantFinition(
  finition: Pick<Finition, 'mode_calcul' | 'prix' | 'cout_fixe'>,
  quantite: number,
  surfaceTotaleM2: number,
): number {
  const base = {
    forfait: finition.prix,
    par_unite: finition.prix * quantite,
    par_m2: finition.prix * surfaceTotaleM2,
    par_mille: (finition.prix * quantite) / 1000,
  }[finition.mode_calcul]
  return arrondi(base + finition.cout_fixe)
}
