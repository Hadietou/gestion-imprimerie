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
  - `sql/06_devis.sql` : `devis_lignes.produit_id` et fonction `enregistrer_devis(p_devis, p_lignes)` (en-tête + lignes + finitions
    en une transaction ; SECURITY DEFINER avec contrôle gérant/accueil, car la RLS réserve la suppression de lignes au gérant).
  - `sql/07_depenses.sql` : `categories_depense`, `depenses`, `mouvements_stock.depense_id`, fonction `enregistrer_depense`
    (à la création d'un achat, chaque article entre en stock et son prix devient le dernier prix d'achat).
  - `sql/08_commandes.sql` : `commandes.objet/remise_pct/taux_tva`, une commande active par devis,
    `creer_commande_depuis_devis()`, déclencheurs : statut de commande suivant les BAT et l'atelier.
  - `sql/09_factures.sql` : une facture active par commande, `creer_facture_depuis_commande()` (gérant, compta, **accueil**),
    échéance = date + `delai_paiement_j`, acompte de la commande → premier paiement.
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
| Dépenses          | ✓ |   |   | ✓ |
| Stock             | ✓ | ✓ | ✓ | ✓ |
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
  lib/tarifs.ts         calculerPrix() : prix de vente d’un produit selon sa grille ;
                        prixProduitLigne() (minimum au m² par pièce), montantFinition()
  lib/devis.ts          accès aux devis, statuts, calculerTotaux() (même formule que recalculer_devis)
  lib/stock.ts          articles, mouvements (entrée / sortie / ajustement), alertes, variation()
  lib/commandes.ts      commandes, BAT, file de production, totalCommande(), enRetard()
  lib/factures.ts       factures, paiements, impayés (vue v_impayes), resteAPayer()
  lib/tableauDeBord.ts  indicateurs par rôle (chaque bloc indépendant : RLS ou module absent n'empêche pas les autres)
  lib/depenses.ts       dépenses, catégories, modes de paiement, enregistrerDepense()
  lib/lettres.ts        montantEnLettres() pour « Arrêté le présent devis à la somme de … »
  parametres/           ParametresProvider + useParametres() (nom, devise, TVA… chargés une fois connecté)
  components/           Chargement, Fenetre (modale <dialog>), GraphiqueFinances (colonnes encaissé / dépenses),
                        Referentiel : recherche sans accents (texteRecherche), peutSupprimer, saisie email/tel,
                        Referentiel (liste groupée + fiche pilotée par des ChampFiche)
  auth/AuthProvider.tsx session + profil (table profils), connexion / déconnexion
  auth/AuthContext.ts   contexte + hook useAuth()
  auth/Protection.tsx   RouteConnectee (session + profil actif), RouteRole (rôles)
  auth/roles.ts         menu et droits par rôle
  layouts/AppLayout.tsx barre latérale (tiroir sur mobile) + en-tête
  pages/                Connexion, CompteInactif, TableauDeBord, Utilisateurs, MonCompte, Parametres,
                        Catalogue (onglets produits & prix / finitions / papiers, supports & encres / machines), Produits,
                        Clients (recherche, appel / e-mail en un clic),
  pages/Stock.tsx       liste (alertes, valeur), fiche article (historique, sortie, entrée, inventaire)
  pages/Depenses.tsx    mois par mois, totaux par catégorie, catégories (gérant) ; FicheDepense.tsx : saisie
  pages/commandes/      Commandes (routes), ListeCommandes, FicheCommande (étapes, BAT, travaux, montants, livraison)
  pages/factures/       Factures (routes), ListeFactures, FicheFacture (paiements), DocumentFacture (A4 / demi-page)
  pages/Impayes.tsx     factures non soldées, retard, appel du client
  pages/Production.tsx  file de l'atelier (Démarrer / Terminé / Bloqué, machine)
  pages/devis/          Devis (routes), ListeDevis, FicheDevis (document + actions), EditeurDevis,
                        LigneDevis, ChoixClient, DocumentDevis (A4 imprimable), edition.ts (état des lignes)
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

## Devis

- Routes : `/devis` liste, `/devis/nouveau` (`?copie=ID` pour dupliquer), `/devis/:id` fiche imprimable, `/devis/:id/modifier`.
- Prix **figés** : une ligne n'est recalculée que si on la modifie (quantité, dimensions, produit, finitions) ;
  `detail_calcul` garde `prix_produit`, `detail` et `prix_force` (prix saisi à la main ; finitions alors enregistrées à 0).
- **Client** : recherche par nom ou téléphone ; s’il n’existe pas, « + Créer le client » le crée sur place
  (`creerClient`, type, nom, téléphone, contact) et le choisit. Entrée = choisir le seul résultat ou créer.
- **Objet automatique** : `resumerObjet()` (edition.ts) résume les produits (« Carte de visite × 500, Bâche × 2 et 1 autre ») ;
  non saisissable, recalculé à chaque enregistrement.
- Section « Produits et travaux » : une ligne neuve ne montre que « Choisir un produit… » ; « Autre travail » (`libre`,
  `produit_id` NULL) = hors catalogue, prix toujours saisi. Dimensions saisies en cm, stockées en mm.
- **TVA optionnelle par devis** : case « Appliquer la TVA » ; décochée → `taux_tva = 0`, le document affiche « Total à payer » HT.
- Modifiable en brouillon / envoyé ; accepté / refusé → lecture seule (« Rouvrir » ou « Dupliquer »). Compta : lecture seule.
- Impression sur feuille **A4** (`@page` A4) : par défaut le devis occupe la **moitié haute** (210 × 148,5 mm,
  classe `format-demi`, en-tête sur une bande émetteur | client | n°) et la feuille est découpée au milieu (trait de coupe).
  Un seul devis par feuille. « Page entière » au choix (`format-a4`). Alerte à l'écran si le contenu dépasse 148,5 mm.
  `window.print()`, styles `@media print` (seul `.document` sort) ; le titre de la page = nom du PDF.

## Dépenses

- Gérant et compta (catégories modifiables par le gérant, `/depenses/categories`).
- **Saisie en 2 temps** ([src/pages/FicheDepense.tsx](src/pages/FicheDepense.tsx)) : 1) catégorie, en deux groupes —
  « Achats pour le stock » = catégories d'articles (Papier, Encre…, issues de `supports.categorie`, dépense enregistrée
  dans la catégorie `achat_stock`) et « Frais de fonctionnement » (catégories de dépense) ; 2) article de cette catégorie :
  article du stock (quantité, prix → entrée en stock) ou, pour les frais, libellé déjà saisi (datalist) / texte libre.
- Catégorie `achat_stock` : à la création, liste d'articles (support, quantité, prix unitaire) ; montant = somme ;
  entrées en stock **définitives** (mouvements `entree` reliés par `depense_id`) → dépense non supprimable,
  correction par ajustement de stock. Les autres dépenses : saisie simple, bouton Dupliquer pour les récurrentes.

## Stock

- Articles = table `supports` (papiers, bâches, textiles, encres, consommables), créés par le gérant dans Tarifs & catalogue.
- Toute variation = un mouvement `mouvements_stock` (jamais modifié ni supprimé) ; le déclencheur met à jour `stock_actuel`.
  Entrée par achat : module Dépenses. Inventaire : on saisit la quantité comptée, l'écart est enregistré en `ajustement` signé.
- Valeur du stock (stock × dernier prix d'achat) visible du gérant et de la compta seulement.

## Commandes, BAT, production

- Une commande naît d'un devis : « ✓ Accepté — créer la commande » (fiche devis) ou « Enregistrer et créer la commande »
  (éditeur → `/devis/:id?commande=1`). `creer_commande_depuis_devis` copie lignes, finitions (→ `instructions`), remise, TVA.
- Statuts : attente_bat → bat_envoye → bat_valide → en_production → termine → livre (annule à part).
  BAT envoyé / validé / refusé et avancement des lignes mettent le statut à jour **côté base** (déclencheurs) ;
  l'interface ne pose à la main que : « Pas de BAT » (bat_valide), livrée, annulée, rétablie.
- Atelier : file `/production` (lignes des commandes bat_valide / en_production non terminées) ; ne voit aucun prix.
- Acompte saisi sur la commande ; « reste à payer » = total (TTC ou HT si sans TVA) − acompte.

## Factures et paiements

- Une facture naît d'une commande (« 🧾 Créer la facture » sur la fiche commande) ; ses produits = lignes de la commande,
  `notes` = objet. Créée directement « À payer » (`emise`). Annulation : gérant et compta ; refacturation possible ensuite.
- `montant_paye` et statut (À payer → Payée en partie → Payée) suivent la table `paiements` (déclencheur du schéma).
  Suppression d'un paiement : gérant. L'acompte de la commande est enregistré en paiement « Acompte versé à la commande … ».
- Impression comme le devis (demi-page A4 par défaut) : déjà réglé, reste à payer, « Arrêtée la présente facture… ».

## Tableau de bord et graphiques

- Gérant / compta : facturé, encaissé, dépenses, **résultat = encaissé − dépenses** (trésorerie du mois), reste à encaisser,
  graphique 6 mois. Tous : « À surveiller » (retards, bloqués, impayés, stock bas, à livrer, BAT, devis). Atelier : aucun montant.
- Graphiques : skill dataviz. Couleurs `--serie-1` (bleu) / `--serie-2` (orange) validées clair et sombre
  (`validate_palette.js`) ; une seule échelle, légende, info-bulle au survol, tableau « Voir les valeurs ».
  Le SVG suit la largeur réelle du conteneur (ResizeObserver) pour rester lisible sur téléphone.

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
- [x] Étape 5 : Clients (fiche selon le type, remise habituelle, recherche)
- [x] Étape 6 : Devis (grille de prix, finitions, remise client, TVA optionnelle, impression A4 / PDF, statuts)
- [x] Étape 7 : Dépenses (catégories, mois, achats de fournitures qui entrent en stock, duplication)
- [x] Étape 8 : Stock (quantités, alertes, valeur, historique, sorties, entrées, inventaire)
- [x] Étape 9 : Commandes, BAT et production (création depuis le devis, suivi automatique du statut)
- [x] Étape 10 : Factures et paiements (depuis la commande, acompte déduit, impression, impayés)
- [x] Étape 11 : Tableau de bord (chiffres du mois, résultat, alertes « À surveiller », graphique 6 mois)
- [ ] Modules métier ( avec calcul de prix, commandes/BAT, production, factures, stock…)
- [ ] PWA, puis Android (Capacitor)
