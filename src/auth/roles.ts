import type { Role } from '../lib/types'

export const LIBELLES_ROLES: Record<Role, string> = {
  gerant: 'Gérant',
  accueil: 'Accueil',
  atelier: 'Atelier',
  compta: 'Comptabilité',
}

export interface EntreeMenu {
  chemin: string
  libelle: string
  icone: string
  roles: Role[]
}

// Menu principal. Les rôles reprennent les droits de lecture définis par les
// politiques RLS de imprimerie_schema.sql (section 10) : un rôle ne voit
// que les modules dont il peut lire les données.
export const MENU: EntreeMenu[] = [
  { chemin: '/tableau-de-bord', libelle: 'Tableau de bord',   icone: '🏠', roles: ['gerant', 'accueil', 'atelier', 'compta'] },
  { chemin: '/clients',         libelle: 'Clients',           icone: '👥', roles: ['gerant', 'accueil', 'compta'] },
  { chemin: '/devis',           libelle: 'Devis',             icone: '📝', roles: ['gerant', 'accueil', 'compta'] },
  { chemin: '/commandes',       libelle: 'Commandes',         icone: '📦', roles: ['gerant', 'accueil', 'atelier', 'compta'] },
  { chemin: '/production',      libelle: 'Production',        icone: '🖨️', roles: ['gerant', 'accueil', 'atelier'] },
  { chemin: '/factures',        libelle: 'Factures',          icone: '🧾', roles: ['gerant', 'accueil', 'compta'] },
  { chemin: '/impayes',         libelle: 'Impayés',           icone: '⏰', roles: ['gerant', 'accueil', 'compta'] },
  { chemin: '/depenses',        libelle: 'Dépenses',          icone: '💸', roles: ['gerant', 'compta'] },
  { chemin: '/stock',           libelle: 'Stock',             icone: '📚', roles: ['gerant', 'accueil', 'atelier', 'compta'] },
  { chemin: '/exports',         libelle: 'Exports Excel',     icone: '📊', roles: ['gerant', 'compta'] },
  { chemin: '/catalogue',       libelle: 'Tarifs & catalogue', icone: '🏷️', roles: ['gerant'] },
  { chemin: '/utilisateurs',    libelle: 'Utilisateurs',      icone: '🔑', roles: ['gerant'] },
  { chemin: '/parametres',      libelle: 'Paramètres',        icone: '🛠️', roles: ['gerant'] },
]

// Page d'arrivée après connexion, selon le métier
export const PAGE_ACCUEIL: Record<Role, string> = {
  gerant: '/tableau-de-bord',
  accueil: '/commandes',
  atelier: '/production',
  compta: '/factures',
}

export function menuPourRole(role: Role): EntreeMenu[] {
  return MENU.filter((e) => e.roles.includes(role))
}
