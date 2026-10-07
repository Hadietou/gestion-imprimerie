import type { ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthProvider'
import { useAuth } from './auth/AuthContext'
import { RouteConnectee, RouteRole } from './auth/Protection'
import { MENU, PAGE_ACCUEIL } from './auth/roles'
import AppLayout from './layouts/AppLayout'
import Connexion from './pages/Connexion'
import CompteInactif from './pages/CompteInactif'
import TableauDeBord from './pages/TableauDeBord'
import EnConstruction from './pages/EnConstruction'

// Pages réelles par chemin ; les autres entrées du MENU affichent « en construction »
const PAGES: Record<string, ReactNode> = {
  '/tableau-de-bord': <TableauDeBord />,
}

function RedirectionAccueil() {
  const { profil } = useAuth()
  return <Navigate to={profil ? PAGE_ACCUEIL[profil.role] : '/connexion'} replace />
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/connexion" element={<Connexion />} />
          <Route path="/compte-inactif" element={<CompteInactif />} />

          <Route element={<RouteConnectee />}>
            <Route element={<AppLayout />}>
              {MENU.map((e) => (
                <Route key={e.chemin} element={<RouteRole roles={e.roles} />}>
                  <Route path={`${e.chemin}/*`} element={PAGES[e.chemin] ?? <EnConstruction module={e.libelle} />} />
                </Route>
              ))}
              <Route path="*" element={<RedirectionAccueil />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
