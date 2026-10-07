import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { PAGE_ACCUEIL } from '../auth/roles'
import Chargement from '../components/Chargement'

// Affiché quand le compte existe mais n'a pas encore été activé par le gérant
// (profils.actif = false, valeur par défaut à la création).
export default function CompteInactif() {
  const { session, profil, chargement, deconnexion, rechargerProfil } = useAuth()
  const [verification, setVerification] = useState(false)

  if (chargement) return <Chargement />
  if (!session) return <Navigate to="/connexion" replace />
  if (profil?.actif) return <Navigate to={PAGE_ACCUEIL[profil.role]} replace />

  async function verifier() {
    setVerification(true)
    await rechargerProfil()
    setVerification(false)
  }

  return (
    <main className="page-connexion">
      <div className="carte-connexion">
        <h1>Compte en attente</h1>
        <p>
          Votre compte <strong>{session.user.email}</strong> a bien été créé, mais il doit être activé par le
          gérant avant de pouvoir utiliser l'application.
        </p>
        <button className="bouton bouton-principal" onClick={verifier} disabled={verification}>
          {verification ? 'Vérification…' : 'Vérifier à nouveau'}
        </button>
        <button className="bouton" onClick={deconnexion}>
          Se déconnecter
        </button>
      </div>
    </main>
  )
}
