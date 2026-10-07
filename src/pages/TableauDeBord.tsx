import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { LIBELLES_ROLES, menuPourRole } from '../auth/roles'

export default function TableauDeBord() {
  const { profil } = useAuth()
  if (!profil) return null

  const raccourcis = menuPourRole(profil.role).filter((e) => e.chemin !== '/tableau-de-bord')
  const prenom = profil.nom_complet.split(' ')[0] || 'à vous'

  return (
    <>
      <p className="bienvenue">
        Bonjour {prenom} — espace <strong>{LIBELLES_ROLES[profil.role]}</strong>
      </p>
      <div className="grille-raccourcis">
        {raccourcis.map((e) => (
          <Link key={e.chemin} to={e.chemin} className="tuile">
            <span className="tuile-icone" aria-hidden="true">{e.icone}</span>
            {e.libelle}
          </Link>
        ))}
      </div>
    </>
  )
}
