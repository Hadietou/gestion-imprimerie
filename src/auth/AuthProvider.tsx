import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Profil } from '../lib/types'
import { AuthContext, type AuthState } from './AuthContext'

function traduireErreur(message: string): string {
  if (message.includes('Invalid login credentials')) return 'E-mail ou mot de passe incorrect.'
  if (message.includes('Email not confirmed')) return 'Adresse e-mail non confirmée.'
  if (message.includes('Failed to fetch')) return 'Connexion au serveur impossible. Vérifiez votre accès internet.'
  return message
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profil, setProfil] = useState<Profil | null>(null)
  const [chargement, setChargement] = useState(true)

  const chargerProfil = useCallback(async (userId: string | undefined) => {
    if (!userId) {
      setProfil(null)
      return
    }
    const { data, error } = await supabase.from('profils').select('*').eq('id', userId).maybeSingle()
    if (error) console.error('Lecture du profil impossible :', error.message)
    setProfil((data as Profil | null) ?? null)
  }, [])

  useEffect(() => {
    let monte = true

    supabase.auth.getSession().then(async ({ data }) => {
      if (!monte) return
      setSession(data.session)
      await chargerProfil(data.session?.user.id)
      if (monte) setChargement(false)
    })

    const { data: abonnement } = supabase.auth.onAuthStateChange((evenement, nouvelleSession) => {
      setSession(nouvelleSession)
      // Pas d'appel Supabase directement dans ce callback (risque de blocage
      // signalé par la doc supabase-js) : on diffère la lecture du profil.
      if (evenement === 'SIGNED_IN' || evenement === 'SIGNED_OUT' || evenement === 'USER_UPDATED') {
        setTimeout(() => {
          chargerProfil(nouvelleSession?.user.id).finally(() => {
            if (monte) setChargement(false)
          })
        }, 0)
      }
    })

    return () => {
      monte = false
      abonnement.subscription.unsubscribe()
    }
  }, [chargerProfil])

  const valeur = useMemo<AuthState>(
    () => ({
      session,
      profil,
      chargement,
      connexion: async (email, motDePasse) => {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: motDePasse })
        if (error) return traduireErreur(error.message)
        // Le profil sera chargé par onAuthStateChange (SIGNED_IN)
        setChargement(true)
        return null
      },
      deconnexion: async () => {
        await supabase.auth.signOut()
        setProfil(null)
      },
      rechargerProfil: () => chargerProfil(session?.user.id),
    }),
    [session, profil, chargement, chargerProfil],
  )

  return <AuthContext.Provider value={valeur}>{children}</AuthContext.Provider>
}
