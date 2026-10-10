import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import Referentiel, { type ChampFiche, type Valeurs } from '../components/Referentiel'
import { formaterMontant } from '../lib/format'
import {
  LIBELLES_CATEGORIES_SUPPORT,
  LIBELLES_MODES_CALCUL,
  LIBELLES_TECHNIQUES,
  LIBELLES_UNITES,
  options,
} from '../lib/libelles'
import type { CategorieSupport, Finition, Machine, Support, Technique, UniteSupport } from '../lib/types'
import { useParametres } from '../parametres/ParametresContext'
import Produits from './Produits'

// Tarifs et catalogue : produits avec leur grille de prix de vente (base des devis),
// finitions, papiers / supports / encres (stock) et machines (atelier).
// Écriture réservée au gérant (RLS), lecture pour tous les rôles.

export default function Catalogue() {
  const devise = useParametres().parametres?.devise ?? ''

  return (
    <>
      <nav className="onglets" aria-label="Catalogue">
        <NavLink to="/catalogue/produits">Produits & prix</NavLink>
        <NavLink to="/catalogue/finitions">Finitions</NavLink>
        <NavLink to="/catalogue/supports">Papiers, supports & encres</NavLink>
        <NavLink to="/catalogue/machines">Machines</NavLink>
      </nav>
      <Routes>
        <Route index element={<Navigate to="/catalogue/produits" replace />} />
        <Route path="produits" element={<Produits devise={devise} />} />
        <Route path="finitions" element={<Finitions devise={devise} />} />
        <Route path="supports" element={<Supports devise={devise} />} />
        <Route path="machines" element={<Machines />} />
        <Route path="*" element={<Navigate to="/catalogue/produits" replace />} />
      </Routes>
    </>
  )
}

const mm = (l: number | null, h: number | null) => (l && h ? `${l} × ${h} mm` : l ? `${l} mm` : null)
const assembler = (...parties: (string | number | null | false | undefined)[]) => parties.filter(Boolean).join(' · ')

// ---------------------------------------------------------------- Machines
// Fiche simplifiée : sert à affecter les travaux aux machines dans l'atelier.
// Les colonnes de coûts de la table machines ne sont plus utilisées.

const technique = (v: Valeurs) => v.technique as Technique

function Machines() {
  const champs: ChampFiche[] = [
    { cle: 'nom', libelle: 'Nom de la machine', type: 'texte', obligatoire: true, large: true },
    { cle: 'technique', libelle: 'Technique', type: 'choix', options: options(LIBELLES_TECHNIQUES), obligatoire: true },
    {
      cle: 'largeur_max_mm',
      libelle: (v) => (technique(v) === 'grand_format' ? 'Laize maximale' : 'Largeur maximale'),
      type: 'entier',
      suffixe: 'mm',
      facultatif: true,
      min: 0,
    },
    {
      cle: 'hauteur_max_mm',
      libelle: 'Hauteur maximale',
      type: 'entier',
      suffixe: 'mm',
      facultatif: true,
      min: 0,
      visible: (v) => technique(v) !== 'grand_format',
    },
    { cle: 'notes', libelle: 'Notes', aide: 'Consignes, entretien, particularités…', type: 'texte_long' },
    { cle: 'actif', libelle: 'Machine en service', type: 'booleen' },
  ]

  return (
    <Referentiel<Machine>
      table="machines"
      libelleNouveau="Nouvelle machine"
      champs={champs}
      defauts={{ technique: 'numerique', actif: true }}
      groupe={(m) => LIBELLES_TECHNIQUES[m.technique]}
      ordreGroupes={Object.values(LIBELLES_TECHNIQUES)}
      messageVide="Aucune machine. Ajoutez vos presses, imprimantes et carrousels : ils serviront à organiser la production."
      resume={(m) =>
        assembler(
          m.technique === 'grand_format' ? m.largeur_max_mm && `laize ${m.largeur_max_mm} mm` : mm(m.largeur_max_mm, m.hauteur_max_mm),
          m.notes,
        )
      }
    />
  )
}

// ---------------------------------------------------------------- Supports

const unite = (v: Valeurs) => v.unite as UniteSupport
const categorie = (v: Valeurs) => v.categorie as CategorieSupport

// Encres et produits au poids / volume : pas de format ni de grammage
const aUnFormat = (v: Valeurs) => categorie(v) !== 'encre' && !['litre', 'kg'].includes(unite(v))
const enRouleau = (v: Valeurs) => ['rouleau', 'm2', 'metre_lineaire'].includes(unite(v))

const EXEMPLES_DESIGNATION: Partial<Record<CategorieSupport, string>> = {
  papier: 'Ex. « Couché brillant 135 g SRA3 (ramette 250 f.) ».',
  bache: 'Ex. « Bâche frontlit 440 g 3,20 × 50 m ».',
  vinyle: 'Ex. « Vinyle adhésif blanc 1,52 × 50 m ».',
  encre: 'Ex. « Encre éco-solvant cyan 1 L », « Toner noir ». Une fiche par couleur.',
  consommable: 'Ex. « Plaque offset CTP », « Émulsion photosensible ».',
}

function Supports({ devise }: { devise: string }) {
  const champs: ChampFiche[] = [
    { cle: 'categorie', libelle: 'Catégorie', type: 'choix', options: options(LIBELLES_CATEGORIES_SUPPORT), obligatoire: true },
    {
      cle: 'nom',
      libelle: 'Désignation',
      aide: (v) => EXEMPLES_DESIGNATION[categorie(v)] ?? '',
      type: 'texte',
      obligatoire: true,
      large: true,
    },
    {
      cle: 'unite',
      libelle: 'Unité d’achat et de stock',
      aide: 'Le stock et le seuil d’alerte se comptent dans cette unité.',
      type: 'choix',
      options: options(LIBELLES_UNITES),
      obligatoire: true,
    },
    {
      cle: 'grammage',
      libelle: 'Grammage',
      type: 'entier',
      suffixe: 'g/m²',
      facultatif: true,
      min: 0,
      visible: (v) => ['papier', 'textile', 'bache', 'vinyle'].includes(categorie(v)),
    },
    {
      cle: 'largeur_mm',
      libelle: (v) => (enRouleau(v) ? 'Laize du rouleau' : 'Largeur'),
      type: 'entier',
      suffixe: 'mm',
      facultatif: true,
      min: 0,
      visible: aUnFormat,
    },
    {
      cle: 'hauteur_mm',
      libelle: 'Hauteur',
      type: 'entier',
      suffixe: 'mm',
      facultatif: true,
      min: 0,
      visible: (v) => aUnFormat(v) && !enRouleau(v),
    },
    {
      cle: 'prix_unitaire',
      libelle: 'Prix d’achat',
      type: 'nombre',
      suffixe: (v) => `${devise} / ${LIBELLES_UNITES[unite(v)] ?? 'unité'}`,
      min: 0,
      obligatoire: true,
    },
    {
      cle: 'seuil_alerte',
      libelle: 'Seuil d’alerte de stock',
      aide: 'Une alerte apparaît quand le stock passe sous ce niveau.',
      type: 'nombre',
      suffixe: (v) => LIBELLES_UNITES[unite(v)] ?? '',
      min: 0,
    },
    { cle: 'fournisseur', libelle: 'Fournisseur', type: 'texte', large: true },
    { cle: 'actif', libelle: 'Article en usage (suivi dans le stock)', type: 'booleen' },
  ]

  return (
    <>
      <p className="texte-doux petit">
        Ce que vous achetez et stockez : papiers, bâches, textiles, encres, consommables. Prix d’achat indicatifs.
        Le stock se mettra à jour par les entrées et sorties du module Stock ; il est seulement affiché ici.
      </p>
      <Referentiel<Support>
        table="supports"
        libelleNouveau="Nouvel article"
        champs={champs}
        defauts={{ categorie: 'papier', unite: 'ramette', actif: true }}
        groupe={(s) => LIBELLES_CATEGORIES_SUPPORT[s.categorie]}
        ordreGroupes={Object.values(LIBELLES_CATEGORIES_SUPPORT)}
        messageVide="Aucun article. Ajoutez vos papiers, bâches, vinyles, textiles, encres et consommables…"
        resume={(s) =>
          assembler(
            s.grammage && `${s.grammage} g`,
            mm(s.largeur_mm, s.hauteur_mm),
            `${formaterMontant(s.prix_unitaire, devise)} / ${LIBELLES_UNITES[s.unite]}`,
            `stock ${s.stock_actuel.toLocaleString('fr-FR')} ${LIBELLES_UNITES[s.unite]}${s.stock_actuel <= s.seuil_alerte && s.seuil_alerte > 0 ? ' ⚠' : ''}`,
            s.fournisseur,
          )
        }
      />
    </>
  )
}

// ---------------------------------------------------------------- Finitions

const SUFFIXE_MODE: Record<string, string> = {
  forfait: '',
  par_unite: ' / ex.',
  par_m2: ' / m²',
  par_mille: ' / 1 000 ex.',
}

function Finitions({ devise }: { devise: string }) {
  const champs: ChampFiche[] = [
    { cle: 'nom', libelle: 'Nom de la finition', aide: 'Ex. « Pelliculage mat recto », « Découpe à la forme ».', type: 'texte', obligatoire: true, large: true },
    {
      cle: 'techniques',
      libelle: 'Proposée pour',
      type: 'choix_multiple',
      options: options(LIBELLES_TECHNIQUES),
      obligatoire: true,
    },
    { cle: 'mode_calcul', libelle: 'Mode de calcul du prix', type: 'choix', options: options(LIBELLES_MODES_CALCUL), obligatoire: true },
    {
      cle: 'prix',
      libelle: 'Prix',
      type: 'nombre',
      suffixe: (v) => `${devise}${SUFFIXE_MODE[v.mode_calcul as string] ?? ''}`,
      min: 0,
      obligatoire: true,
    },
    {
      cle: 'cout_fixe',
      libelle: 'Frais fixes de mise en route',
      aide: 'Ajoutés une fois par travail (réglage, outil de découpe…).',
      type: 'nombre',
      suffixe: devise,
      min: 0,
    },
    { cle: 'actif', libelle: 'Finition proposée dans les devis', type: 'booleen' },
  ]

  return (
    <Referentiel<Finition>
      table="finitions"
      libelleNouveau="Nouvelle finition"
      champs={champs}
      defauts={{ techniques: Object.keys(LIBELLES_TECHNIQUES), mode_calcul: 'par_unite', actif: true }}
      messageVide="Aucune finition. Ajoutez pelliculage, découpe, reliure, œillets…"
      resume={(f) =>
        assembler(
          `${formaterMontant(f.prix, devise)}${SUFFIXE_MODE[f.mode_calcul]}`,
          f.cout_fixe > 0 && `+ ${formaterMontant(f.cout_fixe, devise)} de mise en route`,
          f.techniques.length === 4 ? 'toutes techniques' : f.techniques.map((t) => LIBELLES_TECHNIQUES[t]).join(', '),
        )
      }
    />
  )
}
