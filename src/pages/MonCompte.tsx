import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthContext'
import { LIBELLES_ROLES } from '../auth/roles'
import { supabase } from '../lib/supabase'

export default function MonCompte() {
  const { session, profil } = useAuth()
  const [motDePasse, setMotDePasse] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [envoi, setEnvoi] = useState(false)
  const [message, setMessage] = useState<{ type: 'succes' | 'erreur'; texte: string } | null>(null)

  if (!profil) return null

  async function valider(e: FormEvent) {
    e.preventDefault()
    setMessage(null)
    if (motDePasse !== confirmation) {
      setMessage({ type: 'erreur', texte: 'Les deux mots de passe ne correspondent pas.' })
      return
    }
    setEnvoi(true)
    const { error } = await supabase.auth.updateUser({ password: motDePasse })
    setEnvoi(false)
    if (error) {
      const texte = error.message.includes('different from the old')
        ? "Le nouveau mot de passe doit être différent de l'ancien."
        : error.message
      setMessage({ type: 'erreur', texte })
    } else {
      setMotDePasse('')
      setConfirmation('')
      setMessage({ type: 'succes', texte: 'Mot de passe modifié.' })
    }
  }

  return (
    <div className="colonne-etroite">
      <section className="carte">
        <dl className="identifiants">
          <dt>Nom</dt>
          <dd>{profil.nom_complet}</dd>
          <dt>Identifiant</dt>
          <dd>{session?.user.email}</dd>
          <dt>Rôle</dt>
          <dd>{LIBELLES_ROLES[profil.role]}</dd>
        </dl>
      </section>

      <section className="carte">
        <h2 className="titre-section">Changer mon mot de passe</h2>
        <form className="formulaire" onSubmit={valider}>
          <label>
            Nouveau mot de passe (8 caractères minimum)
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={motDePasse}
              onChange={(e) => setMotDePasse(e.target.value)}
            />
          </label>
          <label>
            Confirmer le mot de passe
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
            />
          </label>
          {message && (
            <p className={`alerte ${message.type === 'succes' ? 'alerte-succes' : 'alerte-erreur'}`} role="status">
              {message.texte}
            </p>
          )}
          <div className="actions-formulaire">
            <span className="espace" />
            <button type="submit" className="bouton bouton-principal" disabled={envoi}>
              {envoi ? 'Enregistrement…' : 'Changer le mot de passe'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
