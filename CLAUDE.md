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

- Source de vérité : [imprimerie_schema.sql](imprimerie_schema.sql) puis les compléments `sql/NN_*.sql`, exécutés dans l'ordre
  — **à relire avant toute fonctionnalité touchant aux données.** Scripts rejouables dans Supabase > SQL Editor.
  Toute évolution de la base = un nouveau fichier `sql/NN_*.sql` rejouable (ne pas modifier un script déjà exécuté).
  - `sql/02_utilisateurs.sql` : fonction `liste_utilisateurs()` (e-mails, réservée au gérant), garde-fou « au moins un gérant actif ».
  - `sql/03_produits.sql` : table `produits` (grille de prix de vente) et type `mode_prix`.
  - `sql/04_encres_consommables.sql` : catégories `encre`, `consommable` et unités ramette, rouleau, litre, kg (à lancer seul).
  - `sql/05_donnees_depart.sql` : finitions et fournitures courantes, prix indicatifs (n’écrase rien d’existant).
  - Ajout de valeur à un ENUM : script séparé, car PostgreSQL interdit d’utiliser la valeur dans la même exécution.
- **Prix des devis = grille de prix de vente** (pratique du marché), PAS un calcul de coût machine.
  Chaque produit a un `mode_prix` (forfait, par unité, m², mètre linéaire, mille, par lot), un prix de base,
  un minimum facturé et des `paliers` JSON. Calcul unique dans [src/lib/tarifs.ts](src/lib/tarifs.ts) (`calculerPrix`).
  Les colonnes de coûts de `machines` (clic, plaque, calage…) et de `devis_lignes` (couleurs, poses, gâche, marge)
  ne sont plus utilisées par l'interface ; la fiche machine sert à l'atelier (nom, technique, format).
- Beaucoup de logique est **côté base** ; ne pas la refaire côté client :
  numérotation `DEV-/CMD-/FAC-AAAA-0001`, TVA par défaut, totaux des devis, stock via `mouvements_stock`,
  `montant_paye` et statut des factures via `paiements`, création auto du profil à l'inscription.
- **Sécurité = RLS** (section 10 du schéma). Le client utilise uniquement la clé `anon` publique ;
  ne jamais mettre la clé `service_role` dans le front.
- Un nouveau compte a `profils.actif = false` : il doit être activé par le gérant.
- Opérations nécessitant la clé `service_role` (création de compte, réinitialisation de mot de passe) :
  **Edge Function** [supabase/functions/gerer-utilisateurs](supabase/functions/gerer-utilisateurs/index.ts),
  qui vérifie elle-même que l'appelant est un gérant actif. Déployée avec « Verify JWT » désactivé (vérification faite dans le code).
  Après modification du fichier, la redéployer (éditeur Supabase ou `npx supabase functions deploy gerer-utilisateurs`).
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
| Tarifs & catalogue, Utilisateurs, Paramètres | ✓ | | | |

Pages d'arrivée : gérant → `/tableau-de-bord`, accueil → `/commandes`, atelier → `/production`, compta → `/factures`.

Le masquage dans le menu et `RouteRole` sont du confort d'interface : la vraie protection reste la RLS.

## Organisation du code

```
src/
  lib/supabase.ts       client Supabase unique (variables VITE_SUPABASE_*)
  lib/types.ts          types alignés sur le schéma SQL
  lib/utilisateurs.ts   accès aux données utilisateurs (RPC + Edge Function)
  lib/parametres.ts     définition, contrôle et enregistrement des paramètres généraux
  lib/format.ts         formaterMontant() et autres mises en forme fr-FR
  lib/libelles.ts       libellés français des ENUM SQL (techniques, unités, catégories…)
  lib/referentiels.ts   CRUD générique des tables de référence (lister, enregistrer, supprimer)
  lib/tarifs.ts         calculerPrix() : prix de vente d’un produit selon sa grille
  parametres/           ParametresProvider + useParametres() (nom, devise, TVA… chargés une fois connecté)
  components/           Chargement, Fenetre (modale <dialog>),
                        Referentiel (liste groupée + fiche pilotée par des ChampFiche)
  auth/AuthProvider.tsx session + profil (table profils), connexion / déconnexion
  auth/AuthContext.ts   contexte + hook useAuth()
  auth/Protection.tsx   RouteConnectee (session + profil actif), RouteRole (rôles)
  auth/roles.ts         menu et droits par rôle
  layouts/AppLayout.tsx barre latérale (tiroir sur mobile) + en-tête
  pages/                Connexion, CompteInactif, TableauDeBord, Utilisateurs, MonCompte, Parametres,
                        Catalogue (onglets produits & prix / finitions / papiers, supports & encres / machines), Produits,
                        EnConstruction (modules à venir)
  styles.css            CSS simple avec variables (thème clair/sombre), pas de framework CSS
sql/                    compléments au schéma, numérotés
supabase/functions/     Edge Functions (Deno)
```

`/mon-compte` (changer son mot de passe) est accessible à tous les rôles, hors `MENU`, via le bloc utilisateur de la barre latérale.

Liste simple d’une table (nom, actif) : réutiliser `Referentiel` avec une description des champs (voir `pages/Catalogue.tsx`).
Supprimer échoue si la ligne est référencée (code 23503) : on propose alors de la désactiver.

Ajouter un module : créer la page dans `src/pages/`, l'enregistrer dans `PAGES` de `src/App.tsx`
(la route et le contrôle de rôle sont générés à partir de `MENU`).

## Conventions

- Mobile d'abord (futur Android) : cibles tactiles ≥ 44 px, menu en tiroir sous 860 px.
- Messages d'erreur Supabase traduits en français avant affichage.
- Sous-routes d’un module (onglets) : toujours des chemins **absolus** dans `NavLink` / `Navigate` (ex. `/catalogue/produits`).
  Les routes de module sont en `/*` et React Router v7 résout les liens relatifs sous l’URL courante, ce qui crée des boucles.
- Montants : la devise est un paramètre ; utiliser `useParametres()` + `formaterMontant(montant, devise)`, ne pas la coder en dur.
- Paramètres : clé/valeur texte. Nouvelle clé = l'ajouter dans `SECTIONS_PARAMETRES` (src/lib/parametres.ts) ;
  elle est créée en base au premier enregistrement (upsert). Nombres stockés avec un point décimal (lus en `::numeric` par la base).

## Commandes

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # vérifie les types puis construit dist/
npm run lint
```

Configuration locale : copier `.env.example` en `.env.local` et renseigner l'URL et la clé `anon`
(Supabase > Project Settings > API). Sur Cloudflare Pages, définir les mêmes variables dans les paramètres du projet.

## Déploiement

- Dépôt GitHub : https://github.com/Hadietou/gestion-imprimerie (branche `main`)
- Production : https://gestion-imprimerie.pages.dev — Cloudflare Pages redéploie à chaque `git push` sur `main`
- Projet Supabase : `pjoghzbheeweseerfztw`
- Variables Cloudflare (Settings > Variables) : `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (clé publishable `sb_publishable_…`),
  `NODE_VERSION=22`. Elles sont intégrées au build : après modification, relancer un déploiement.

## Avancement

- [x] Étape 1 : projet, connexion Supabase, page de connexion, navigation selon le rôle
- [x] Étape 2 : gestion des utilisateurs (création, activation, rôle, mot de passe) + « Mon compte »
- [x] Étape 3 : Paramètres (coordonnées, devise, TVA, marge, délais, mentions des documents)
- [x] Étape 4 : Tarifs & catalogue (produits avec grille de prix et paliers, finitions, supports, machines simplifiées)
- [ ] Modules métier (clients, devis avec calcul de prix, commandes/BAT, production, factures, stock…)
- [ ] PWA, puis Android (Capacitor)
