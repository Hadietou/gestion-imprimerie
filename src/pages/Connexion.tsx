import { useState, type FormEvent } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { PAGE_ACCUEIL } from '../auth/roles'
import { supabaseConfigure } from '../lib/supabase'
import Chargement from '../components/Chargement'

export default function Connexion() {
  const { session, profil, chargement, connexion } = useAuth()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [motDePasse, setMotDePasse] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)
  const [envoi, setEnvoi] = useState(false)

  if (chargement) return <Chargement />
  if (session && profil?.actif) {
    const depuis = (location.state as { depuis?: string } | null)?.depuis
    return <Navigate to={depuis && depuis !== '/' ? depuis : PAGE_ACCUEIL[profil.role]} replace />
  }
  if (session) return <Navigate to="/compte-inactif" replace />

  async function valider(e: FormEvent) {
    e.preventDefault()
    setErreur(null)
    setEnvoi(true)
    const message = await connexion(email, motDePasse)
    setEnvoi(false)
    if (message) setErreur(message)
  }

  return (
    <main className="page-connexion">
      <form className="carte-connexion" onSubmit={valider} noValidate={false}>
        <img src="/favicon.svg" alt="" width={56} height={56} />
        <h1>Gestion Imprimerie</h1>
        <p className="sous-titre">Connectez-vous pour accéder à votre espace.</p>

        {!supabaseConfigure && (
          <p className="alerte alerte-attention">
            Supabase n'est pas configuré : renseignez <code>VITE_SUPABASE_URL</code> et{' '}
            <code>VITE_SUPABASE_ANON_KEY</code> dans <code>.env.local</code>.
          </p>
        )}

        <label>
          Adresse e-mail
          <input
            type="email"
            autoComplete="username"
            inputMode="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>

        <label>
          Mot de passe
          <input
            type="password"
            autoComplete="current-password"
            required
            value={motDePasse}
            onChange={(e) => setMotDePasse(e.target.value)}
          />
        </label>

        {erreur && <p className="alerte alerte-erreur" role="alert">{erreur}</p>}

        <button type="submit" className="bouton bouton-principal" disabled={envoi}>
          {envoi ? 'Connexion…' : 'Se connecter'}
        </button>

        <p className="aide">Mot de passe oublié ou pas de compte ? Adressez-vous au gérant.</p>
      </form>
    </main>
  )
}
