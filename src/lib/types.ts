// Types alignés sur imprimerie_schema.sql (à compléter au fil des modules,
// ou à générer avec : npx supabase gen types typescript --project-id <id>)

export type Role = 'gerant' | 'accueil' | 'atelier' | 'compta'

export interface Profil {
  id: string
  nom_complet: string
  role: Role
  actif: boolean
  created_at: string
  updated_at: string
}

export type Technique = 'numerique' | 'offset' | 'grand_format' | 'serigraphie'
export type CategorieSupport = 'papier' | 'vinyle' | 'bache' | 'textile' | 'rigide' | 'autre'
export type UniteSupport = 'feuille' | 'm2' | 'metre_lineaire' | 'piece'
export type ModeCalculFinition = 'forfait' | 'par_unite' | 'par_m2' | 'par_mille'

export interface Machine {
  id: number
  nom: string
  technique: Technique
  largeur_max_mm: number | null
  hauteur_max_mm: number | null
  nb_couleurs_max: number | null
  cadence_heure: number | null
  cout_horaire: number
  cout_calage: number
  cout_plaque: number
  cout_ecran: number
  prix_clic_nb: number
  prix_clic_couleur: number
  cout_encre_m2: number
  gache_pct_defaut: number
  actif: boolean
  notes: string | null
}

export interface Support {
  id: number
  nom: string
  categorie: CategorieSupport
  grammage: number | null
  largeur_mm: number | null
  hauteur_mm: number | null
  unite: UniteSupport
  prix_unitaire: number
  stock_actuel: number
  seuil_alerte: number
  fournisseur: string | null
  actif: boolean
}

export interface Finition {
  id: number
  nom: string
  techniques: Technique[]
  mode_calcul: ModeCalculFinition
  prix: number
  cout_fixe: number
  actif: boolean
}

// Ligne renvoyée par la fonction SQL liste_utilisateurs() (sql/02_utilisateurs.sql)
export interface Utilisateur {
  id: string
  email: string
  nom_complet: string
  role: Role
  actif: boolean
  created_at: string
  derniere_connexion: string | null
}
