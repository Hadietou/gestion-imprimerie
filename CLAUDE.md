# Gestion Imprimerie

Application de gestion pour une imprimerie (numérique, offset, grand format, sérigraphie).
4 utilisateurs, chacun avec un rôle : **gérant**, **accueil**, **atelier**, **compta**.
Toute l'interface, les messages et le code métier (noms de variables, composants) sont **en français**.

## Stack

- **React 19 + Vite + TypeScript** (template officiel `react-ts`, lint avec `oxlint`)
- **react-router-dom** (BrowserRouter) pour la navigation
- **Supabase** (`@supabase/supabase-js`) : base PostgreSQL + authentification e-mail / mot de passe
- **Hébergement** : Cloudflare Pages (offre gratuite). Build : `npm run build`, dossier de sortie `dist`.
  Les routes SPA fonctionnent sans configuration (Pages renvoie `index.html` en l'absence de `404.html`).
- **Plus tard** : PWA (vite-plugin-pwa), puis application Android via Capacitor.
- Contrainte : **100 % gratuit** (offres gratuites Supabase et Cloudflare, pas de service payant).

## Base de données

- Source de vérité : [imprimerie_schema.sql](imprimerie_schema.sql) — **à relire avant toute fonctionnalité touchant aux données.**
  Le script est rejouable dans Supabase > SQL Editor.
- Beaucoup de logique est **côté base** ; ne pas la refaire côté client :
  numérotation `DEV-/CMD-/FAC-AAAA-0001`, TVA par défaut, totaux des devis, stock via `mouvements_stock`,
  `montant_paye` et statut des factures via `paiements`, création auto du profil à l'inscription.
- **Sécurité = RLS** (section 10 du schéma). Le client utilise uniquement la clé `anon` publique ;
  ne jamais mettre la clé `service_role` dans le front.
- Un nouveau compte a `profils.actif = false` : il doit être activé par le gérant.
- Types TS : écrits à la main dans `src/lib/types.ts` pour l'instant ;
  à terme, générer avec `npx supabase gen types typescript --project-id <id>`.

## Rôles et navigation

Défini dans [src/auth/roles.ts](src/auth/roles.ts) : `MENU` (module → rôles autorisés) et `PAGE_ACCUEIL` (page d'arrivée par rôle).
Les droits du menu **reprennent les droits de lecture RLS** ; si on modifie les politiques SQL, mettre à jour `MENU`.

| Module            | gérant | accueil | atelier | compta |
|-------------------|:------:|:-------:|:-------:|:------:|
| Tableau de bord   | ✓ | ✓ | ✓ | ✓ |
| Clients           | ✓ | ✓ |   | ✓ |
| Devis             | ✓ | ✓ |   | ✓ (lecture) |
| Commandes         | ✓ | ✓ | ✓ | ✓ (lecture) |
| Production        | ✓ | ✓ | ✓ |   |
| Factures, Impayés | ✓ | ✓ (lecture) |   | ✓ |
| Stock             | ✓ | ✓ | ✓ |   |
| Machines & tarifs, Utilisateurs, Paramètres | ✓ | | | |

Pages d'arrivée : gérant → `/tableau-de-bord`, accueil → `/commandes`, atelier → `/production`, compta → `/factures`.

Le masquage dans le menu et `RouteRole` sont du confort d'interface : la vraie protection reste la RLS.

## Organisation du code

```
src/
  lib/supabase.ts       client Supabase unique (variables VITE_SUPABASE_*)
  lib/types.ts          types alignés sur le schéma SQL
  auth/AuthProvider.tsx session + profil (table profils), connexion / déconnexion
  auth/AuthContext.ts   contexte + hook useAuth()
  auth/Protection.tsx   RouteConnectee (session + profil actif), RouteRole (rôles)
  auth/roles.ts         menu et droits par rôle
  layouts/AppLayout.tsx barre latérale (tiroir sur mobile) + en-tête
  pages/                Connexion, CompteInactif, TableauDeBord, EnConstruction (modules à venir)
  styles.css            CSS simple avec variables (thème clair/sombre), pas de framework CSS
```

Ajouter un module : créer la page dans `src/pages/`, l'enregistrer dans `PAGES` de `src/App.tsx`
(la route et le contrôle de rôle sont générés à partir de `MENU`).

## Conventions

- Mobile d'abord (futur Android) : cibles tactiles ≥ 44 px, menu en tiroir sous 860 px.
- Messages d'erreur Supabase traduits en français avant affichage.
- Montants : la devise est un paramètre (`parametres.devise`), ne pas la coder en dur.

## Commandes

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # vérifie les types puis construit dist/
npm run lint
```

Configuration locale : copier `.env.example` en `.env.local` et renseigner l'URL et la clé `anon`
(Supabase > Project Settings > API). Sur Cloudflare Pages, définir les mêmes variables dans les paramètres du projet.

## Avancement

- [x] Étape 1 : projet, connexion Supabase, page de connexion, navigation selon le rôle
- [ ] Modules métier (clients, devis avec calcul de prix, commandes/BAT, production, factures, stock…)
- [ ] Gestion des utilisateurs par le gérant (activation, rôle)
- [ ] PWA, puis Android (Capacitor)
