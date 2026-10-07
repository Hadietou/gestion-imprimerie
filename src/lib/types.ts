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
