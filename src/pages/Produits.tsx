import { useState } from 'react'
import Referentiel, { type ChampFiche, type ProprietesEditeur, type Valeurs } from '../components/Referentiel'
import { formaterMontant } from '../lib/format'
import { LIBELLES_MODES_PRIX, LIBELLES_TECHNIQUES, UNITES_MODE_PRIX, options } from '../lib/libelles'
import { calculerPrix, trierPaliers } from '../lib/tarifs'
import type { ModePrix, Palier, Produit } from '../lib/types'

// Onglet « Produits & prix » : la grille de prix de vente utilisée par les devis

interface LignePalier {
  quantite: string
  prix: string
}

const mode = (v: Valeurs) => v.mode_prix as ModePrix
const versNombre = (s: string) => Number(String(s).replace(',', '.').replace(/\s/g, ''))
const versTexte = (n: number) => String(n).replace('.', ',')

// Lecture tolérante des valeurs du formulaire (pour le simulateur)
function grilleDuFormulaire(v: Valeurs) {
  const lignes = (v.paliers as LignePalier[]) ?? []
  return {
    mode_prix: mode(v),
    prix: versNombre(v.prix as string) || 0,
    quantite_minimum: versNombre(v.quantite_minimum as string) || 0,
    paliers: lignes
      .map((l) => ({ quantite: versNombre(l.quantite), prix: versNombre(l.prix) }))
      .filter((p) => p.quantite > 0 && Number.isFinite(p.prix)),
  }
}

function convertirPaliers(valeur: unknown, valeurs: Valeurs): { valeur: Palier[] } | { erreur: string } {
  const m = mode(valeurs)
  if (m === 'forfait') return { valeur: [] }
  const lignes = ((valeur as LignePalier[]) ?? []).filter((l) => l.quantite.trim() || l.prix.trim())
  const paliers: Palier[] = []
  for (const l of lignes) {
    const quantite = versNombre(l.quantite)
    const prix = versNombre(l.prix)
    if (!(quantite > 0)) return { erreur: 'Chaque palier doit avoir une quantité supérieure à 0.' }
    if (!Number.isFinite(prix) || prix < 0) return { erreur: 'Chaque palier doit avoir un prix valide.' }
    if (paliers.some((p) => p.quantite === quantite)) return { erreur: `La quantité ${quantite} apparaît deux fois.` }
    paliers.push({ quantite, prix })
  }
  if (m === 'par_lot' && paliers.length === 0) return { erreur: 'Indiquez au moins un lot (quantité et prix).' }
  return { valeur: trierPaliers(paliers) }
}

function EditeurPaliers({ valeur, valeurs, onChange, devise }: ProprietesEditeur & { devise: string }) {
  const lignes = (valeur as LignePalier[]) ?? []
  const m = mode(valeurs)
  const unite = UNITES_MODE_PRIX[m]
  const lot = m === 'par_lot'

  const modifier = (i: number, champ: keyof LignePalier, texte: string) =>
    onChange(lignes.map((l, j) => (j === i ? { ...l, [champ]: texte } : l)))

  return (
    <div className="paliers">
      {lignes.length > 0 && (
        <div className="paliers-entete texte-doux petit" aria-hidden="true">
          <span>{lot ? `Quantité (${unite})` : `À partir de (${unite})`}</span>
          <span>{lot ? `Prix du lot (${devise})` : `Prix ${m === 'par_mille' ? 'le mille' : `par ${unite}`} (${devise})`}</span>
          <span />
        </div>
      )}
      {lignes.map((l, i) => (
        <div key={i} className="palier">
          <input
            inputMode="decimal"
            aria-label={`Palier ${i + 1} : quantité`}
            value={l.quantite}
            onChange={(e) => modifier(i, 'quantite', e.target.value)}
          />
          <input
            inputMode="decimal"
            aria-label={`Palier ${i + 1} : prix`}
            value={l.prix}
            onChange={(e) => modifier(i, 'prix', e.target.value)}
          />
          <button
            type="button"
            className="bouton-fermer"
            aria-label={`Supprimer le palier ${i + 1}`}
            onClick={() => onChange(lignes.filter((_, j) => j !== i))}
          >
            ✕
          </button>
        </div>
      ))}
      <button type="button" className="bouton bouton-discret" onClick={() => onChange([...lignes, { quantite: '', prix: '' }])}>
        + Ajouter {lot ? 'un lot' : 'un palier'}
      </button>
    </div>
  )
}

function Simulateur({ valeurs, devise }: { valeurs: Valeurs; devise: string }) {
  const [quantite, setQuantite] = useState('')
  const m = mode(valeurs)
  const unite = UNITES_MODE_PRIX[m]
  const q = m === 'forfait' ? 1 : versNombre(quantite)
  const resultat = q > 0 ? calculerPrix(grilleDuFormulaire(valeurs), q, unite) : null

  return (
    <div className="simulateur">
      {m !== 'forfait' && (
        <span className="champ-suffixe">
          <input
            inputMode="decimal"
            placeholder="Quantité"
            aria-label="Quantité à simuler"
            value={quantite}
            onChange={(e) => setQuantite(e.target.value)}
          />
          <span>{unite}</span>
        </span>
      )}
      <p className="resultat-simulation" aria-live="polite">
        {resultat ? (
          <>
            <strong>{formaterMontant(resultat.total, devise)}</strong>
            <span className="texte-doux petit"> — {resultat.detail}</span>
          </>
        ) : (
          <span className="texte-doux petit">Saisissez une quantité pour voir le prix.</span>
        )}
      </p>
    </div>
  )
}

export default function Produits({ devise }: { devise: string }) {
  const champs: ChampFiche[] = [
    { cle: 'nom', libelle: 'Nom du produit', aide: 'Ex. « Carte de visite 85×55 recto/verso », « Bâche 440 g ».', type: 'texte', obligatoire: true, large: true },
    { cle: 'technique', libelle: 'Technique', type: 'choix', options: options(LIBELLES_TECHNIQUES), obligatoire: true },
    { cle: 'mode_prix', libelle: 'Mode de prix', type: 'choix', options: options(LIBELLES_MODES_PRIX), obligatoire: true },
    {
      cle: 'prix',
      libelle: (v) => (mode(v) === 'forfait' ? 'Prix du forfait' : 'Prix de base'),
      aide: (v) => (mode(v) === 'forfait' ? '' : 'Appliqué tant qu’aucun palier n’est atteint.'),
      type: 'nombre',
      suffixe: (v) =>
        mode(v) === 'forfait' ? devise : `${devise} / ${mode(v) === 'par_mille' ? '1 000 ex.' : UNITES_MODE_PRIX[mode(v)]}`,
      min: 0,
      obligatoire: true,
      visible: (v) => mode(v) !== 'par_lot',
    },
    {
      cle: 'quantite_minimum',
      libelle: 'Minimum facturé',
      aide: 'Ex. 1 m² pour une petite bâche. 0 = pas de minimum.',
      type: 'nombre',
      suffixe: (v) => UNITES_MODE_PRIX[mode(v)],
      min: 0,
      visible: (v) => !['forfait', 'par_lot'].includes(mode(v)),
    },
    {
      cle: 'paliers',
      libelle: (v) => (mode(v) === 'par_lot' ? 'Lots et prix' : 'Prix dégressifs (facultatif)'),
      aide: (v) =>
        mode(v) === 'par_lot'
          ? 'Prix total pour chaque quantité. Une quantité intermédiaire est facturée au lot supérieur.'
          : 'Prix unitaire appliqué à partir d’une quantité.',
      type: 'personnalise',
      visible: (v) => mode(v) !== 'forfait',
      initialiser: (p) =>
        ((p as Palier[] | undefined) ?? []).map((x) => ({ quantite: versTexte(x.quantite), prix: versTexte(x.prix) })),
      convertir: convertirPaliers,
      editeur: (p) => <EditeurPaliers {...p} devise={devise} />,
    },
    {
      cle: 'simulation',
      libelle: 'Tester la grille',
      type: 'personnalise',
      editeur: ({ valeurs }) => <Simulateur valeurs={valeurs} devise={devise} />,
    },
    { cle: 'description', libelle: 'Description', aide: 'Détails repris sur le devis : papier, format, finitions incluses…', type: 'texte_long' },
    { cle: 'actif', libelle: 'Produit proposé dans les devis', type: 'booleen' },
  ]

  const resumePrix = (p: Produit) => {
    const unite = UNITES_MODE_PRIX[p.mode_prix]
    const paliers = trierPaliers(p.paliers)
    if (p.mode_prix === 'forfait') return `Forfait ${formaterMontant(p.prix, devise)}`
    if (p.mode_prix === 'par_lot') {
      const premiers = paliers.slice(0, 3).map((l) => `${l.quantite.toLocaleString('fr-FR')} ${unite} = ${formaterMontant(l.prix, devise)}`)
      return premiers.join(' · ') + (paliers.length > 3 ? ' …' : '')
    }
    const base = `${formaterMontant(p.prix, devise)} / ${p.mode_prix === 'par_mille' ? '1 000 ex.' : unite}`
    return [
      base,
      paliers.length > 0 && `${paliers.length} palier${paliers.length > 1 ? 's' : ''} dégressif${paliers.length > 1 ? 's' : ''}`,
      p.quantite_minimum > 0 && `min. ${p.quantite_minimum.toLocaleString('fr-FR')} ${unite}`,
    ]
      .filter(Boolean)
      .join(' · ')
  }

  return (
    <Referentiel<Produit>
      table="produits"
      libelleNouveau="Nouveau produit"
      champs={champs}
      defauts={{ technique: 'numerique', mode_prix: 'par_lot', paliers: [], actif: true }}
      groupe={(p) => LIBELLES_TECHNIQUES[p.technique]}
      ordreGroupes={Object.values(LIBELLES_TECHNIQUES)}
      messageVide="Aucun produit. Ajoutez vos produits courants avec leurs prix : cartes de visite, flyers, bâches, t-shirts…"
      resume={resumePrix}
    />
  )
}
