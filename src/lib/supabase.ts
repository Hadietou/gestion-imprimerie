import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabaseConfigure = Boolean(url && anonKey && !url.includes('xxxxxxxx'))

// Client unique pour toute l'application.
// La clé « anon » est publique : la sécurité repose sur les règles RLS du schéma.
export const supabase = createClient(url || 'http://localhost', anonKey || 'cle-manquante', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
