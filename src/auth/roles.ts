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
  /** Page accessible mais absente du menu (rattachée à une autre entrée) */
  horsMenu?: boolean
  /** Autres chemins qui mettent cette entrée en surbrillance */
  aussi?: string[]
}

// Menu principal. Les rôles reprennent les droits de lecture définis par les
// politiques RLS de imprimerie_schema.sql (section 10) : un rôle ne voit
// que les modules dont il peut lire les données.
export const MENU: EntreeMenu[] = [
  { chemin: '/tableau-de-bord', libelle: 'Tableau de bord',   icone: '🏠', roles: ['gerant', 'accueil', 'atelier', 'compta'] },
  { chemin: '/clients',         libelle: 'Clients',           icone: '👥', roles: ['gerant', 'accueil', 'compta'] },
  // Commandes et devis : un seul menu, deux onglets (OngletsVentes)
  { chemin: '/commandes',       libelle: 'Commandes & devis', icone: '📦', roles: ['gerant', 'accueil', 'atelier', 'compta'], aussi: ['/devis'] },
  { chemin: '/devis',           libelle: 'Commandes & devis', icone: '📝', roles: ['gerant', 'accueil', 'compta'], horsMenu: true },
  { chemin: '/production',      libelle: 'Production',        icone: '🖨️', roles: ['gerant', 'accueil', 'atelier'] },
  { chemin: '/factures',        libelle: 'Factures',          icone: '🧾', roles: ['gerant', 'accueil', 'compta'] },
  { chemin: '/impayes',         libelle: 'Impayés',           icone: '⏰', roles: ['gerant', 'accueil', 'compta'] },
  { chemin: '/depenses',        libelle: 'Dépenses',          icone: '💸', roles: ['gerant', 'compta'] },
  { chemin: '/stock',           libelle: 'Stock',             icone: '📚', roles: ['gerant', 'accueil', 'atelier', 'compta'] },
  { chemin: '/exports',         libelle: 'Exports Excel',     icone: '📊', roles: ['gerant', 'compta'] },
  { chemin: '/catalogue',       libelle: 'Produits & fournitures', icone: '🏷️', roles: ['gerant'] },
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
  return MENU.filter((e) => e.roles.includes(role) && !e.horsMenu).map((e) =>
    // L'atelier ne voit pas les devis
    role === 'atelier' && e.chemin === '/commandes' ? { ...e, libelle: 'Commandes' } : e,
  )
}
