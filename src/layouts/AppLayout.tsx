import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { LIBELLES_ROLES, MENU, menuPourRole } from '../auth/roles'
import { useParametres } from '../parametres/ParametresContext'
import { useInstallation } from '../pwa/installation'

export default function AppLayout() {
  const { profil, deconnexion } = useAuth()
  const { parametres } = useParametres()
  const { peutInstaller, installer } = useInstallation()
  const location = useLocation()
  const [menuOuvert, setMenuOuvert] = useState(false)

  if (!profil) return null
  const entrees = menuPourRole(profil.role)
  const titre =
    location.pathname === '/mon-compte'
      ? 'Mon compte'
      : (MENU.find((e) => location.pathname.startsWith(e.chemin))?.libelle ?? '')

  return (
    <div className={`app ${menuOuvert ? 'menu-ouvert' : ''}`}>
      <aside className="barre-laterale" aria-label="Navigation principale">
        <div className="marque">
          <img src="/favicon.svg" alt="" width={32} height={32} />
          <span>{parametres?.nom_imprimerie || 'Imprimerie'}</span>
        </div>
        <nav>
          {entrees.map((e) => (
            <NavLink key={e.chemin} to={e.chemin} className="lien-menu" onClick={() => setMenuOuvert(false)}>
              <span aria-hidden="true">{e.icone}</span>
              {e.libelle}
            </NavLink>
          ))}
        </nav>
        {peutInstaller && (
          <button type="button" className="bouton bouton-installer" onClick={installer}>
            📲 Installer l’application
          </button>
        )}
        <div className="utilisateur">
          <div>
            <strong>{profil.nom_complet || 'Utilisateur'}</strong>
            <span className={`badge-role role-${profil.role}`}>{LIBELLES_ROLES[profil.role]}</span>
          </div>
          <NavLink to="/mon-compte" className="bouton bouton-discret" onClick={() => setMenuOuvert(false)}>
            Mon compte
          </NavLink>
          <button className="bouton bouton-discret" onClick={deconnexion}>
            Se déconnecter
          </button>
        </div>
      </aside>

      <div className="voile" onClick={() => setMenuOuvert(false)} aria-hidden="true" />

      <div className="contenu">
        <header className="entete">
          <button
            className="bouton-menu"
            onClick={() => setMenuOuvert((o) => !o)}
            aria-label="Ouvrir le menu"
            aria-expanded={menuOuvert}
          >
            ☰
          </button>
          <h1>{titre}</h1>
        </header>
        <main className="page">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
