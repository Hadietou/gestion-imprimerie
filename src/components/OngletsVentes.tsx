import { NavLink } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

// Onglets du menu « Commandes & devis » : les deux listes sous un seul menu.
// L'atelier ne voit pas les devis : pas d'onglets pour lui.
export default function OngletsVentes() {
  const { profil } = useAuth()
  if (!profil || profil.role === 'atelier') return null
  return (
    <nav className="onglets" aria-label="Commandes et devis">
      <NavLink to="/commandes">📦 Commandes</NavLink>
      <NavLink to="/devis">📝 Devis</NavLink>
    </nav>
  )
}
