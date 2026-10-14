import { NavLink } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import type { Role } from '../lib/types'

// Onglets en haut des listes regroupées sous une même entrée de menu
// (moins de menus : voir « horsMenu » dans auth/roles.ts).

interface Onglet {
  chemin: string
  libelle: string
  roles?: Role[]
}

function Onglets({ titre, onglets }: { titre: string; onglets: Onglet[] }) {
  const { profil } = useAuth()
  if (!profil) return null
  const visibles = onglets.filter((o) => !o.roles || o.roles.includes(profil.role))
  // Un seul onglet visible (ex. l'atelier sans les devis) : pas de barre d'onglets
  if (visibles.length < 2) return null
  return (
    <nav className="onglets" aria-label={titre}>
      {visibles.map((o) => (
        <NavLink key={o.chemin} to={o.chemin}>
          {o.libelle}
        </NavLink>
      ))}
    </nav>
  )
}

export function OngletsVentes() {
  return (
    <Onglets
      titre="Commandes et devis"
      onglets={[
        { chemin: '/commandes', libelle: '📦 Commandes' },
        { chemin: '/devis', libelle: '📝 Devis', roles: ['gerant', 'accueil', 'compta'] },
      ]}
    />
  )
}

export function OngletsStock() {
  return (
    <Onglets
      titre="Stock et fournitures"
      onglets={[
        { chemin: '/stock', libelle: '📚 Stock' },
        { chemin: '/catalogue', libelle: '🏷️ Produits & fournitures', roles: ['gerant'] },
      ]}
    />
  )
}

export function OngletsAdministration() {
  return (
    <Onglets
      titre="Administration"
      onglets={[
        { chemin: '/parametres', libelle: '🛠️ Paramètres', roles: ['gerant'] },
        { chemin: '/utilisateurs', libelle: '🔑 Utilisateurs', roles: ['gerant'] },
        { chemin: '/exports', libelle: '📊 Sauvegarde & Excel' },
      ]}
    />
  )
}

export function OngletsFactures() {
  return (
    <Onglets
      titre="Factures et impayés"
      onglets={[
        { chemin: '/factures', libelle: '🧾 Factures' },
        { chemin: '/impayes', libelle: '⏰ Impayés' },
      ]}
    />
  )
}
