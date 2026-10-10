import { supabase } from './supabase'

// Table « parametres » : paires clé / valeur texte (imprimerie_schema.sql, section 2).
// Les 6 premières clés sont créées par le schéma ; les autres sont ajoutées
// par la page Paramètres au premier enregistrement.

export type CleParametre =
  | 'nom_imprimerie'
  | 'adresse'
  | 'telephone'
  | 'indicatif_telephone'
  | 'email'
  | 'numero_fiscal'
  | 'registre_commerce'
  | 'devise'
  | 'taux_tva'
  | 'marge_defaut_pct'
  | 'validite_devis_j'
  | 'delai_paiement_j'
  | 'mentions_devis'
  | 'mentions_factures'
  | 'coordonnees_bancaires'

export type Parametres = Record<CleParametre, string>

export interface DefinitionParametre {
  cle: CleParametre
  libelle: string
  aide?: string
  type: 'texte' | 'texte_long' | 'nombre' | 'entier' | 'devise' | 'email' | 'telephone'
  min?: number
  max?: number
  suffixe?: string
  obligatoire?: boolean
}

export interface SectionParametres {
  titre: string
  description: string
  champs: DefinitionParametre[]
}

export const SECTIONS_PARAMETRES: SectionParametres[] = [
  {
    titre: "L'imprimerie",
    description: 'Coordonnées affichées en en-tête des devis et factures.',
    champs: [
      { cle: 'nom_imprimerie', libelle: "Nom de l'imprimerie", type: 'texte', obligatoire: true },
      { cle: 'adresse', libelle: 'Adresse', type: 'texte_long' },
      { cle: 'telephone', libelle: 'Téléphone', type: 'telephone' },
      {
        cle: 'indicatif_telephone',
        libelle: 'Indicatif téléphonique du pays',
        aide: 'Ajouté aux numéros des clients pour WhatsApp (222 = Mauritanie).',
        type: 'entier',
        min: 1,
        max: 999,
      },
      { cle: 'email', libelle: 'E-mail', type: 'email' },
      { cle: 'numero_fiscal', libelle: 'Numéro d’identification fiscale (NIF)', type: 'texte' },
      { cle: 'registre_commerce', libelle: 'Registre du commerce (RC)', type: 'texte' },
    ],
  },
  {
    titre: 'Prix et taxes',
    description: 'Valeurs reprises automatiquement à la création des devis et factures.',
    champs: [
      {
        cle: 'devise',
        libelle: 'Devise',
        aide: 'Code à 3 lettres, ex. MRU (ouguiya), XOF (franc CFA), EUR.',
        type: 'devise',
        obligatoire: true,
      },
      { cle: 'taux_tva', libelle: 'Taux de TVA', aide: 'Mettre 0 si vous ne facturez pas la TVA.', type: 'nombre', min: 0, max: 100, suffixe: '%', obligatoire: true },
      { cle: 'marge_defaut_pct', libelle: 'Marge par défaut', aide: 'Appliquée au coût de revient dans le calcul des devis.', type: 'nombre', min: 0, max: 1000, suffixe: '%', obligatoire: true },
    ],
  },
  {
    titre: 'Devis et factures',
    description: 'Délais et textes imprimés en bas des documents.',
    champs: [
      { cle: 'validite_devis_j', libelle: 'Validité des devis', type: 'entier', min: 1, max: 365, suffixe: 'jours', obligatoire: true },
      { cle: 'delai_paiement_j', libelle: 'Échéance des factures', aide: '0 = paiement à réception.', type: 'entier', min: 0, max: 365, suffixe: 'jours', obligatoire: true },
      { cle: 'mentions_devis', libelle: 'Mentions en bas des devis', aide: 'Ex. conditions : acompte de 50 % à la commande.', type: 'texte_long' },
      { cle: 'mentions_factures', libelle: 'Mentions en bas des factures', aide: 'Ex. pénalités de retard, conditions de paiement.', type: 'texte_long' },
      { cle: 'coordonnees_bancaires', libelle: 'Coordonnées bancaires / paiement mobile', aide: 'Banque, numéro de compte, Bankily, Masrvi…', type: 'texte_long' },
    ],
  },
]

export const DEFINITIONS_PARAMETRES = SECTIONS_PARAMETRES.flatMap((s) => s.champs)

export const DEVISES_COURANTES = ['MRU', 'XOF', 'XAF', 'EUR', 'USD', 'MAD', 'DZD', 'TND', 'GNF']

const VALEURS_PAR_DEFAUT: Parametres = {
  nom_imprimerie: 'Mon Imprimerie',
  adresse: '',
  telephone: '',
  indicatif_telephone: '222',
  email: '',
  numero_fiscal: '',
  registre_commerce: '',
  devise: '',
  taux_tva: '0',
  marge_defaut_pct: '30',
  validite_devis_j: '30',
  delai_paiement_j: '30',
  mentions_devis: '',
  mentions_factures: '',
  coordonnees_bancaires: '',
}

export async function chargerParametres(): Promise<Parametres> {
  const { data, error } = await supabase.from('parametres').select('cle, valeur')
  if (error) throw new Error(error.message)
  const resultat = { ...VALEURS_PAR_DEFAUT }
  for (const ligne of data ?? []) {
    if (ligne.cle in resultat) resultat[ligne.cle as CleParametre] = ligne.valeur
  }
  // Valeur provisoire du schéma, à remplacer par un vrai code devise
  if (resultat.devise === 'À définir') resultat.devise = ''
  return resultat
}

// Contrôle et mise au format d'une valeur avant enregistrement.
// Renvoie un message d'erreur, ou la valeur normalisée.
export function normaliser(def: DefinitionParametre, brute: string): { valeur: string } | { erreur: string } {
  let valeur = brute.trim()
  if (!valeur) {
    return def.obligatoire ? { erreur: 'Champ obligatoire.' } : { valeur: '' }
  }

  switch (def.type) {
    case 'devise':
      valeur = valeur.toUpperCase()
      if (!/^[A-Z]{3}$/.test(valeur)) return { erreur: 'Code à 3 lettres attendu (ex. MRU).' }
      break
    case 'nombre':
    case 'entier': {
      // La base convertit avec valeur::numeric : point décimal obligatoire
      valeur = valeur.replace(',', '.').replace(/\s/g, '')
      const n = Number(valeur)
      if (!Number.isFinite(n)) return { erreur: 'Nombre attendu.' }
      if (def.type === 'entier' && !Number.isInteger(n)) return { erreur: 'Nombre entier attendu.' }
      if (def.min !== undefined && n < def.min) return { erreur: `Minimum : ${def.min}.` }
      if (def.max !== undefined && n > def.max) return { erreur: `Maximum : ${def.max}.` }
      valeur = String(n)
      break
    }
    case 'email':
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valeur)) return { erreur: 'Adresse e-mail invalide.' }
      break
  }
  return { valeur }
}

export async function enregistrerParametres(valeurs: Partial<Parametres>) {
  const lignes = DEFINITIONS_PARAMETRES.filter((d) => valeurs[d.cle] !== undefined).map((d) => ({
    cle: d.cle,
    valeur: valeurs[d.cle] as string,
    description: d.aide ? `${d.libelle} — ${d.aide}` : d.libelle,
  }))
  if (lignes.length === 0) return
  const { error } = await supabase.from('parametres').upsert(lignes, { onConflict: 'cle' })
  if (error) throw new Error(error.message)
}
