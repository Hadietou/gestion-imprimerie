import { Navigate, Outlet, useLocation } from 'react-router-dom'
import type { Role } from '../lib/types'
import { useAuth } from './AuthContext'
import { PAGE_ACCUEIL } from './roles'
import Chargement from '../components/Chargement'

// Exige une session ouverte ET un profil actif
export function RouteConnectee() {
  const { session, profil, chargement } = useAuth()
  const location = useLocation()

  if (chargement) return <Chargement />
  if (!session) return <Navigate to="/connexion" replace state={{ depuis: location.pathname }} />
  if (!profil || !profil.actif) return <Navigate to="/compte-inactif" replace />
  return <Outlet />
}

// Restreint une route à certains rôles ; sinon renvoie vers la page d'accueil du rôle
export function RouteRole({ roles }: { roles: Role[] }) {
  const { profil } = useAuth()
  if (!profil) return null
  if (!roles.includes(profil.role)) return <Navigate to={PAGE_ACCUEIL[profil.role]} replace />
  return <Outlet />
}
