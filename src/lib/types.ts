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
