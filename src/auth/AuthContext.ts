import { createContext, useContext } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { Profil } from '../lib/types'

export interface AuthState {
  session: Session | null
  profil: Profil | null
  chargement: boolean
  connexion: (email: string, motDePasse: string) => Promise<string | null>
  deconnexion: () => Promise<void>
  rechargerProfil: () => Promise<void>
}

export const AuthContext = createContext<AuthState | null>(null)

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth doit être utilisé dans <AuthProvider>')
  return ctx
}
