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
import type { Finition, Machine, Support, Technique, UniteSupport } from '../lib/types'
import { useParametres } from '../parametres/ParametresContext'

// Machines, supports et finitions : données utilisées par le calcul des devis.
// Écriture réservée au gérant (RLS), lecture pour tous les rôles.

export default function Catalogue() {
  const devise = useParametres().parametres?.devise ?? ''

  return (
    <>
      <nav className="onglets" aria-label="Catalogue">
        <NavLink to="machines">Machines</NavLink>
        <NavLink to="supports">Papiers & supports</NavLink>
        <NavLink to="finitions">Finitions</NavLink>
      </nav>
      <Routes>
        <Route index element={<Navigate to="machines" replace />} />
        <Route path="machines" element={<Machines devise={devise} />} />
        <Route path="supports" element={<Supports devise={devise} />} />
        <Route path="finitions" element={<Finitions devise={devise} />} />
        <Route path="*" element={<Navigate to="machines" replace />} />
      </Routes>
    </>
  )
}

const mm = (l: number | null, h: number | null) => (l && h ? `${l} × ${h} mm` : l ? `${l} mm` : null)
const assembler = (...parties: (string | number | null | false | undefined)[]) => parties.filter(Boolean).join(' · ')

// ---------------------------------------------------------------- Machines

const technique = (v: Valeurs) => v.technique as Technique
const pour = (...techniques: Technique[]) => (v: Valeurs) => techniques.includes(technique(v))

const UNITE_CADENCE: Record<Technique, string> = {
  numerique: 'feuilles/h',
  offset: 'feuilles/h',
  grand_format: 'm²/h',
  serigraphie: 'pièces/h',
}

function Machines({ devise }: { devise: string }) {
  const champs: ChampFiche[] = [
    { cle: 'technique', libelle: 'Technique', type: 'choix', options: options(LIBELLES_TECHNIQUES), obligatoire: true },
    { cle: 'nom', libelle: 'Nom de la machine', type: 'texte', obligatoire: true, large: true },
    {
      cle: 'largeur_max_mm',
      libelle: (v) => (technique(v) === 'grand_format' ? 'Laize maximale' : 'Largeur maximale'),
      aide: (v) => (technique(v) === 'grand_format' ? 'Largeur utile d’impression.' : 'Format de feuille maximal.'),
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
    {
      cle: 'nb_couleurs_max',
      libelle: (v) => (technique(v) === 'offset' ? 'Nombre de groupes (couleurs)' : 'Nombre de stations (couleurs)'),
      type: 'entier',
      facultatif: true,
      min: 1,
      visible: pour('offset', 'serigraphie'),
    },
    {
      cle: 'cadence_heure',
      libelle: 'Cadence',
      type: 'entier',
      suffixe: (v) => UNITE_CADENCE[technique(v)] ?? '/h',
      facultatif: true,
      min: 0,
    },
    {
      cle: 'prix_clic_couleur',
      libelle: 'Prix du clic couleur',
      aide: 'Coût par face imprimée (contrat de maintenance).',
      type: 'nombre',
      suffixe: `${devise} / clic`,
      min: 0,
      visible: pour('numerique'),
    },
    {
      cle: 'prix_clic_nb',
      libelle: 'Prix du clic noir',
      type: 'nombre',
      suffixe: `${devise} / clic`,
      min: 0,
      visible: pour('numerique'),
    },
    {
      cle: 'cout_plaque',
      libelle: 'Coût d’une plaque',
      aide: 'Une plaque par couleur et par face.',
      type: 'nombre',
      suffixe: devise,
      min: 0,
      visible: pour('offset'),
    },
    {
      cle: 'cout_ecran',
      libelle: 'Coût d’un écran',
      aide: 'Un écran par couleur.',
      type: 'nombre',
      suffixe: devise,
      min: 0,
      visible: pour('serigraphie'),
    },
    {
      cle: 'cout_calage',
      libelle: 'Coût de calage',
      aide: 'Mise en route, par couleur et par face.',
      type: 'nombre',
      suffixe: devise,
      min: 0,
      visible: pour('offset', 'serigraphie'),
    },
    {
      cle: 'cout_encre_m2',
      libelle: 'Coût d’encre au m²',
      type: 'nombre',
      suffixe: `${devise} / m²`,
      min: 0,
      visible: pour('grand_format'),
    },
    {
      cle: 'cout_horaire',
      libelle: 'Coût horaire',
      aide: 'Machine + opérateur (amortissement, électricité, salaire).',
      type: 'nombre',
      suffixe: `${devise} / h`,
      min: 0,
    },
    {
      cle: 'gache_pct_defaut',
      libelle: 'Gâche par défaut',
      aide: 'Part de supports perdus aux réglages.',
      type: 'nombre',
      suffixe: '%',
      min: 0,
      max: 100,
    },
    { cle: 'notes', libelle: 'Notes', type: 'texte_long' },
    { cle: 'actif', libelle: 'Machine en service (proposée dans les devis)', type: 'booleen' },
  ]

  const prix = (n: number, unite = '') => formaterMontant(n, devise) + unite

  return (
    <Referentiel<Machine>
      table="machines"
      libelleNouveau="Nouvelle machine"
      champs={champs}
      defauts={{ technique: 'numerique', gache_pct_defaut: '3', actif: true }}
      groupe={(m) => LIBELLES_TECHNIQUES[m.technique]}
      ordreGroupes={Object.values(LIBELLES_TECHNIQUES)}
      messageVide="Aucune machine. Ajoutez vos presses, imprimantes et carrousels de sérigraphie."
      resume={(m) =>
        assembler(
          mm(m.largeur_max_mm, m.technique === 'grand_format' ? null : m.hauteur_max_mm),
          m.nb_couleurs_max && `${m.nb_couleurs_max} couleur${m.nb_couleurs_max > 1 ? 's' : ''}`,
          m.technique === 'numerique' && `clic couleur ${prix(m.prix_clic_couleur)}`,
          m.technique === 'offset' && `plaque ${prix(m.cout_plaque)}`,
          m.technique === 'serigraphie' && `écran ${prix(m.cout_ecran)}`,
          m.technique === 'grand_format' && `encre ${prix(m.cout_encre_m2, '/m²')}`,
          m.cout_horaire > 0 && prix(m.cout_horaire, '/h'),
        )
      }
    />
  )
}

// ---------------------------------------------------------------- Supports

const unite = (v: Valeurs) => v.unite as UniteSupport

function Supports({ devise }: { devise: string }) {
  const champs: ChampFiche[] = [
    { cle: 'categorie', libelle: 'Catégorie', type: 'choix', options: options(LIBELLES_CATEGORIES_SUPPORT), obligatoire: true },
    { cle: 'nom', libelle: 'Désignation', aide: 'Ex. « Couché brillant 135 g 65×92 ».', type: 'texte', obligatoire: true, large: true },
    {
      cle: 'unite',
      libelle: 'Vendu / stocké à la',
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
      visible: (v) => ['papier', 'textile', 'bache', 'vinyle'].includes(v.categorie as string),
    },
    {
      cle: 'largeur_mm',
      libelle: (v) => (unite(v) === 'feuille' || unite(v) === 'piece' ? 'Largeur' : 'Laize du rouleau'),
      type: 'entier',
      suffixe: 'mm',
      facultatif: true,
      min: 0,
    },
    {
      cle: 'hauteur_mm',
      libelle: 'Hauteur',
      type: 'entier',
      suffixe: 'mm',
      facultatif: true,
      min: 0,
      visible: (v) => unite(v) === 'feuille' || unite(v) === 'piece',
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
    { cle: 'actif', libelle: 'Support disponible (proposé dans les devis)', type: 'booleen' },
  ]

  return (
    <>
      <p className="texte-doux petit">
        Le stock se met à jour par les entrées et sorties du module Stock ; il est seulement affiché ici.
      </p>
      <Referentiel<Support>
        table="supports"
        libelleNouveau="Nouveau support"
        champs={champs}
        defauts={{ categorie: 'papier', unite: 'feuille', actif: true }}
        groupe={(s) => LIBELLES_CATEGORIES_SUPPORT[s.categorie]}
        ordreGroupes={Object.values(LIBELLES_CATEGORIES_SUPPORT)}
        messageVide="Aucun support. Ajoutez vos papiers, vinyles, bâches, textiles…"
        resume={(s) =>
          assembler(
            s.grammage && `${s.grammage} g`,
            mm(s.largeur_mm, s.hauteur_mm),
            `${formaterMontant(s.prix_unitaire, devise)} / ${LIBELLES_UNITES[s.unite]}`,
            `stock ${s.stock_actuel.toLocaleString('fr-FR')}${s.stock_actuel <= s.seuil_alerte && s.seuil_alerte > 0 ? ' ⚠' : ''}`,
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
