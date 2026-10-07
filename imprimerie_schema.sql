-- =====================================================================
--  GESTION IMPRIMERIE — Schéma de base de données (Supabase / PostgreSQL)
--  Étape 1 : tables, numérotation automatique, stock, sécurité par rôles
--
--  Utilisation : Supabase > SQL Editor > New query > coller > Run
--  Le script peut être relancé : il ne crée que ce qui n'existe pas encore
--  (sauf les politiques de sécurité, recréées à chaque exécution).
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. TYPES (listes de valeurs)
-- ---------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE role_utilisateur AS ENUM ('gerant', 'accueil', 'atelier', 'compta');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE technique_impression AS ENUM ('numerique', 'offset', 'grand_format', 'serigraphie');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE statut_devis AS ENUM ('brouillon', 'envoye', 'accepte', 'refuse', 'expire');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE statut_commande AS ENUM
    ('attente_bat', 'bat_envoye', 'bat_valide', 'en_production', 'termine', 'livre', 'annule');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE statut_production AS ENUM ('a_faire', 'en_cours', 'termine', 'bloque');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE statut_bat AS ENUM ('envoye', 'valide', 'refuse');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE statut_facture AS ENUM ('brouillon', 'emise', 'partiellement_payee', 'payee', 'annulee');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE mode_paiement AS ENUM ('especes', 'virement', 'cheque', 'mobile_money', 'carte', 'autre');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE categorie_support AS ENUM ('papier', 'vinyle', 'bache', 'textile', 'rigide', 'autre');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE unite_support AS ENUM ('feuille', 'm2', 'metre_lineaire', 'piece');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE mode_calcul_finition AS ENUM ('forfait', 'par_unite', 'par_m2', 'par_mille');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE type_mouvement AS ENUM ('entree', 'sortie', 'ajustement');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ---------------------------------------------------------------------
-- 2. UTILISATEURS ET PARAMÈTRES
-- ---------------------------------------------------------------------

-- Profil lié au compte de connexion Supabase (auth.users)
CREATE TABLE IF NOT EXISTS profils (
  id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nom_complet text NOT NULL DEFAULT '',
  role        role_utilisateur NOT NULL DEFAULT 'atelier',
  actif       boolean NOT NULL DEFAULT false,   -- le gérant active chaque nouveau compte
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Paramètres généraux (TVA, devise, marge par défaut...)
CREATE TABLE IF NOT EXISTS parametres (
  cle         text PRIMARY KEY,
  valeur      text NOT NULL,
  description text
);

-- Compteurs pour la numérotation (DEV-2026-0001, CMD-..., FAC-...)
CREATE TABLE IF NOT EXISTS compteurs (
  prefixe text NOT NULL,
  annee   int  NOT NULL,
  dernier int  NOT NULL DEFAULT 0,
  PRIMARY KEY (prefixe, annee)
);


-- ---------------------------------------------------------------------
-- 3. RÉFÉRENTIELS : clients, machines, supports, finitions
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS clients (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  type_client  text NOT NULL DEFAULT 'entreprise' CHECK (type_client IN ('entreprise', 'particulier', 'administration', 'association')),
  nom          text NOT NULL,
  contact      text,
  telephone    text,
  email        text,
  adresse      text,
  numero_fiscal text,
  remise_pct   numeric(5,2) NOT NULL DEFAULT 0,   -- remise habituelle du client
  notes        text,
  actif        boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_clients_nom ON clients (lower(nom));

-- Machines : les colonnes utiles dépendent de la technique
CREATE TABLE IF NOT EXISTS machines (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nom                text NOT NULL,
  technique          technique_impression NOT NULL,
  largeur_max_mm     int,             -- format feuille max, ou laize pour le grand format
  hauteur_max_mm     int,
  nb_couleurs_max    int,             -- offset : nb de groupes ; sérigraphie : nb de stations
  cadence_heure      int,             -- feuilles/h, m²/h ou pièces/h
  cout_horaire       numeric(12,2) NOT NULL DEFAULT 0,  -- coût machine + opérateur
  cout_calage        numeric(12,2) NOT NULL DEFAULT 0,  -- offset / sérigraphie : par calage
  cout_plaque        numeric(12,2) NOT NULL DEFAULT 0,  -- offset : par plaque
  cout_ecran         numeric(12,2) NOT NULL DEFAULT 0,  -- sérigraphie : par écran
  prix_clic_nb       numeric(12,4) NOT NULL DEFAULT 0,  -- numérique : par face A4/A3
  prix_clic_couleur  numeric(12,4) NOT NULL DEFAULT 0,
  cout_encre_m2      numeric(12,2) NOT NULL DEFAULT 0,  -- grand format
  gache_pct_defaut   numeric(5,2)  NOT NULL DEFAULT 3,
  actif              boolean NOT NULL DEFAULT true,
  notes              text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- Papiers et supports (aussi utilisés pour le stock)
CREATE TABLE IF NOT EXISTS supports (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nom              text NOT NULL,                 -- ex. "Couché brillant 135 g 65x92"
  categorie        categorie_support NOT NULL DEFAULT 'papier',
  grammage         int,
  largeur_mm       int,                           -- format feuille ou laize du rouleau
  hauteur_mm       int,                           -- vide pour un rouleau
  unite            unite_support NOT NULL DEFAULT 'feuille',
  prix_unitaire    numeric(12,4) NOT NULL DEFAULT 0,  -- prix d'achat par unité
  stock_actuel     numeric(14,2) NOT NULL DEFAULT 0,
  seuil_alerte     numeric(14,2) NOT NULL DEFAULT 0,
  fournisseur      text,
  actif            boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS finitions (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nom          text NOT NULL,                     -- ex. "Pelliculage mat recto"
  techniques   technique_impression[] NOT NULL DEFAULT '{numerique,offset,grand_format,serigraphie}',
  mode_calcul  mode_calcul_finition NOT NULL DEFAULT 'par_unite',
  prix         numeric(12,4) NOT NULL DEFAULT 0,  -- selon le mode de calcul
  cout_fixe    numeric(12,2) NOT NULL DEFAULT 0,  -- mise en route éventuelle
  actif        boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);


-- ---------------------------------------------------------------------
-- 4. DEVIS
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS devis (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  numero         text UNIQUE,                     -- rempli automatiquement
  client_id      bigint NOT NULL REFERENCES clients(id),
  statut         statut_devis NOT NULL DEFAULT 'brouillon',
  date_devis     date NOT NULL DEFAULT current_date,
  validite_jours int  NOT NULL DEFAULT 30,
  objet          text,
  remise_pct     numeric(5,2)  NOT NULL DEFAULT 0,
  taux_tva       numeric(5,2)  NOT NULL DEFAULT 0,
  total_ht       numeric(14,2) NOT NULL DEFAULT 0,  -- recalculé automatiquement
  total_tva      numeric(14,2) NOT NULL DEFAULT 0,
  total_ttc      numeric(14,2) NOT NULL DEFAULT 0,
  notes          text,
  created_by     uuid REFERENCES profils(id) DEFAULT auth.uid(),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_devis_client ON devis (client_id);

-- Une ligne = un travail (ex. 1000 flyers A5 quadri recto/verso)
CREATE TABLE IF NOT EXISTS devis_lignes (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  devis_id          bigint NOT NULL REFERENCES devis(id) ON DELETE CASCADE,
  ordre             int NOT NULL DEFAULT 1,
  description       text NOT NULL,
  technique         technique_impression NOT NULL,
  machine_id        bigint REFERENCES machines(id),
  support_id        bigint REFERENCES supports(id),
  quantite          int NOT NULL CHECK (quantite > 0),
  largeur_mm        int,                    -- format fini
  hauteur_mm        int,
  couleurs_recto    int NOT NULL DEFAULT 4,
  couleurs_verso    int NOT NULL DEFAULT 0, -- 0 = recto seul
  poses             int NOT NULL DEFAULT 1, -- exemplaires par feuille
  gache_pct         numeric(5,2) NOT NULL DEFAULT 0,
  detail_calcul     jsonb NOT NULL DEFAULT '{}',  -- trace du calcul (papier, calage, clics...)
  cout_revient      numeric(14,2) NOT NULL DEFAULT 0,
  marge_pct         numeric(6,2)  NOT NULL DEFAULT 0,
  prix_total_ht     numeric(14,2) NOT NULL DEFAULT 0,
  prix_unitaire_ht  numeric(14,4) GENERATED ALWAYS AS (prix_total_ht / quantite) STORED
);
CREATE INDEX IF NOT EXISTS idx_devis_lignes_devis ON devis_lignes (devis_id);

CREATE TABLE IF NOT EXISTS devis_ligne_finitions (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  devis_ligne_id bigint NOT NULL REFERENCES devis_lignes(id) ON DELETE CASCADE,
  finition_id    bigint NOT NULL REFERENCES finitions(id),
  quantite       numeric(14,2) NOT NULL DEFAULT 1,  -- unités, m² ou milliers selon le mode
  montant        numeric(14,2) NOT NULL DEFAULT 0
);


-- ---------------------------------------------------------------------
-- 5. COMMANDES, PRODUCTION ET BAT
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS commandes (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  numero                 text UNIQUE,
  devis_id               bigint REFERENCES devis(id),
  client_id              bigint NOT NULL REFERENCES clients(id),
  statut                 statut_commande NOT NULL DEFAULT 'attente_bat',
  date_commande          date NOT NULL DEFAULT current_date,
  date_livraison_prevue  date,
  date_livraison_reelle  date,
  urgent                 boolean NOT NULL DEFAULT false,
  acompte                numeric(14,2) NOT NULL DEFAULT 0,
  notes                  text,
  created_by             uuid REFERENCES profils(id) DEFAULT auth.uid(),
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_commandes_statut ON commandes (statut);
CREATE INDEX IF NOT EXISTS idx_commandes_client ON commandes (client_id);

-- Chaque ligne de commande passe sur une machine : c'est la file de l'atelier
CREATE TABLE IF NOT EXISTS commande_lignes (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  commande_id        bigint NOT NULL REFERENCES commandes(id) ON DELETE CASCADE,
  devis_ligne_id     bigint REFERENCES devis_lignes(id),
  description        text NOT NULL,
  technique          technique_impression NOT NULL,
  machine_id         bigint REFERENCES machines(id),
  support_id         bigint REFERENCES supports(id),
  quantite           int NOT NULL CHECK (quantite > 0),
  prix_total_ht      numeric(14,2) NOT NULL DEFAULT 0,
  statut_production  statut_production NOT NULL DEFAULT 'a_faire',
  priorite           int NOT NULL DEFAULT 0,          -- plus grand = plus urgent
  operateur_id       uuid REFERENCES profils(id),
  debut_production   timestamptz,
  fin_production     timestamptz,
  instructions       text,                            -- consignes pour l'atelier
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cmd_lignes_machine ON commande_lignes (machine_id, statut_production);

-- Bons à tirer : le fichier reste sur Google Drive, on garde le lien
CREATE TABLE IF NOT EXISTS bat (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  commande_id   bigint NOT NULL REFERENCES commandes(id) ON DELETE CASCADE,
  version       int NOT NULL DEFAULT 1,
  lien_fichier  text,
  statut        statut_bat NOT NULL DEFAULT 'envoye',
  commentaire_client text,
  date_envoi    timestamptz NOT NULL DEFAULT now(),
  date_reponse  timestamptz,
  envoye_par    uuid REFERENCES profils(id) DEFAULT auth.uid(),
  UNIQUE (commande_id, version)
);


-- ---------------------------------------------------------------------
-- 6. FACTURES ET PAIEMENTS
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS factures (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  numero        text UNIQUE,
  commande_id   bigint REFERENCES commandes(id),
  client_id     bigint NOT NULL REFERENCES clients(id),
  statut        statut_facture NOT NULL DEFAULT 'brouillon',
  date_facture  date NOT NULL DEFAULT current_date,
  date_echeance date,
  total_ht      numeric(14,2) NOT NULL DEFAULT 0,
  taux_tva      numeric(5,2)  NOT NULL DEFAULT 0,
  total_tva     numeric(14,2) GENERATED ALWAYS AS (round(total_ht * taux_tva / 100, 2)) STORED,
  total_ttc     numeric(14,2) GENERATED ALWAYS AS (total_ht + round(total_ht * taux_tva / 100, 2)) STORED,
  montant_paye  numeric(14,2) NOT NULL DEFAULT 0,     -- mis à jour par les paiements
  notes         text,
  created_by    uuid REFERENCES profils(id) DEFAULT auth.uid(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_factures_statut ON factures (statut);

CREATE TABLE IF NOT EXISTS paiements (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  facture_id    bigint NOT NULL REFERENCES factures(id) ON DELETE CASCADE,
  date_paiement date NOT NULL DEFAULT current_date,
  montant       numeric(14,2) NOT NULL CHECK (montant > 0),
  mode          mode_paiement NOT NULL DEFAULT 'especes',
  reference     text,
  saisi_par     uuid REFERENCES profils(id) DEFAULT auth.uid(),
  created_at    timestamptz NOT NULL DEFAULT now()
);


-- ---------------------------------------------------------------------
-- 7. STOCK
-- ---------------------------------------------------------------------

-- Toute variation de stock passe par un mouvement (traçabilité)
CREATE TABLE IF NOT EXISTS mouvements_stock (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  support_id   bigint NOT NULL REFERENCES supports(id),
  type         type_mouvement NOT NULL,
  quantite     numeric(14,2) NOT NULL,   -- toujours positive, sauf ajustement (+/-)
  commande_id  bigint REFERENCES commandes(id),
  motif        text,
  saisi_par    uuid REFERENCES profils(id) DEFAULT auth.uid(),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mvt_support ON mouvements_stock (support_id);


-- ---------------------------------------------------------------------
-- 8. FONCTIONS ET DÉCLENCHEURS AUTOMATIQUES
-- ---------------------------------------------------------------------

-- 8.1 Mise à jour automatique de updated_at
CREATE OR REPLACE FUNCTION maj_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['profils','clients','machines','supports','finitions',
                           'devis','commandes','commande_lignes','factures'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_updated ON %I', t, t);
    EXECUTE format('CREATE TRIGGER trg_%s_updated BEFORE UPDATE ON %I
                    FOR EACH ROW EXECUTE FUNCTION maj_updated_at()', t, t);
  END LOOP;
END $$;

-- 8.2 Numérotation : DEV-2026-0001, CMD-2026-0001, FAC-2026-0001
CREATE OR REPLACE FUNCTION prochain_numero(p_prefixe text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_annee int := extract(year FROM current_date)::int;
  v_num   int;
BEGIN
  INSERT INTO compteurs (prefixe, annee, dernier) VALUES (p_prefixe, v_annee, 1)
  ON CONFLICT (prefixe, annee) DO UPDATE SET dernier = compteurs.dernier + 1
  RETURNING dernier INTO v_num;
  RETURN p_prefixe || '-' || v_annee || '-' || lpad(v_num::text, 4, '0');
END $$;

CREATE OR REPLACE FUNCTION attribuer_numero() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.numero IS NULL OR NEW.numero = '' THEN
    NEW.numero := prochain_numero(TG_ARGV[0]);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_devis_numero ON devis;
CREATE TRIGGER trg_devis_numero BEFORE INSERT ON devis
  FOR EACH ROW EXECUTE FUNCTION attribuer_numero('DEV');

DROP TRIGGER IF EXISTS trg_commandes_numero ON commandes;
CREATE TRIGGER trg_commandes_numero BEFORE INSERT ON commandes
  FOR EACH ROW EXECUTE FUNCTION attribuer_numero('CMD');

DROP TRIGGER IF EXISTS trg_factures_numero ON factures;
CREATE TRIGGER trg_factures_numero BEFORE INSERT ON factures
  FOR EACH ROW EXECUTE FUNCTION attribuer_numero('FAC');

-- 8.3 TVA par défaut à la création d'un devis ou d'une facture
CREATE OR REPLACE FUNCTION tva_par_defaut() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.taux_tva IS NULL OR NEW.taux_tva = 0 THEN
    SELECT coalesce(valeur::numeric, 0) INTO NEW.taux_tva
    FROM parametres WHERE cle = 'taux_tva';
    NEW.taux_tva := coalesce(NEW.taux_tva, 0);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_devis_tva ON devis;
CREATE TRIGGER trg_devis_tva BEFORE INSERT ON devis
  FOR EACH ROW EXECUTE FUNCTION tva_par_defaut();

DROP TRIGGER IF EXISTS trg_factures_tva ON factures;
CREATE TRIGGER trg_factures_tva BEFORE INSERT ON factures
  FOR EACH ROW EXECUTE FUNCTION tva_par_defaut();

-- 8.4 Totaux du devis recalculés à chaque changement de ligne ou de remise
CREATE OR REPLACE FUNCTION recalculer_devis(p_devis_id bigint) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  v_brut numeric(14,2);
BEGIN
  SELECT coalesce(sum(prix_total_ht), 0) INTO v_brut
  FROM devis_lignes WHERE devis_id = p_devis_id;

  UPDATE devis SET
    total_ht  = round(v_brut * (1 - remise_pct / 100), 2),
    total_tva = round(round(v_brut * (1 - remise_pct / 100), 2) * taux_tva / 100, 2),
    total_ttc = round(v_brut * (1 - remise_pct / 100), 2)
              + round(round(v_brut * (1 - remise_pct / 100), 2) * taux_tva / 100, 2)
  WHERE id = p_devis_id;
END $$;

CREATE OR REPLACE FUNCTION trg_lignes_recalcul() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM recalculer_devis(coalesce(NEW.devis_id, OLD.devis_id));
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_devis_lignes_total ON devis_lignes;
CREATE TRIGGER trg_devis_lignes_total AFTER INSERT OR UPDATE OR DELETE ON devis_lignes
  FOR EACH ROW EXECUTE FUNCTION trg_lignes_recalcul();

CREATE OR REPLACE FUNCTION trg_devis_remise() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.remise_pct IS DISTINCT FROM OLD.remise_pct
     OR NEW.taux_tva IS DISTINCT FROM OLD.taux_tva THEN
    PERFORM recalculer_devis(NEW.id);
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_devis_remise_total ON devis;
CREATE TRIGGER trg_devis_remise_total AFTER UPDATE OF remise_pct, taux_tva ON devis
  FOR EACH ROW EXECUTE FUNCTION trg_devis_remise();

-- 8.5 Stock mis à jour par chaque mouvement
CREATE OR REPLACE FUNCTION appliquer_mouvement_stock() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE supports SET stock_actuel = stock_actuel +
    CASE NEW.type
      WHEN 'entree'     THEN abs(NEW.quantite)
      WHEN 'sortie'     THEN -abs(NEW.quantite)
      WHEN 'ajustement' THEN NEW.quantite
    END
  WHERE id = NEW.support_id;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_mouvement_stock ON mouvements_stock;
CREATE TRIGGER trg_mouvement_stock AFTER INSERT ON mouvements_stock
  FOR EACH ROW EXECUTE FUNCTION appliquer_mouvement_stock();

-- 8.6 Montant payé et statut de la facture mis à jour par les paiements
CREATE OR REPLACE FUNCTION maj_facture_paiements() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_facture bigint := coalesce(NEW.facture_id, OLD.facture_id);
  v_paye    numeric(14,2);
BEGIN
  SELECT coalesce(sum(montant), 0) INTO v_paye FROM paiements WHERE facture_id = v_facture;

  UPDATE factures SET
    montant_paye = v_paye,
    statut = CASE
      WHEN statut IN ('annulee', 'brouillon') THEN statut
      WHEN v_paye >= total_ttc THEN 'payee'::statut_facture
      WHEN v_paye > 0          THEN 'partiellement_payee'::statut_facture
      ELSE 'emise'::statut_facture
    END
  WHERE id = v_facture;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_paiements_facture ON paiements;
CREATE TRIGGER trg_paiements_facture AFTER INSERT OR UPDATE OR DELETE ON paiements
  FOR EACH ROW EXECUTE FUNCTION maj_facture_paiements();

-- 8.7 Création automatique du profil à l'inscription d'un utilisateur
CREATE OR REPLACE FUNCTION creer_profil_utilisateur() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO profils (id, nom_complet)
  VALUES (NEW.id, coalesce(NEW.raw_user_meta_data->>'nom_complet', NEW.email))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_nouvel_utilisateur ON auth.users;
CREATE TRIGGER trg_nouvel_utilisateur AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION creer_profil_utilisateur();


-- ---------------------------------------------------------------------
-- 9. VUES UTILES POUR L'APPLICATION
-- ---------------------------------------------------------------------

-- File de production de l'atelier (sans prix ni marges)
CREATE OR REPLACE VIEW v_file_production WITH (security_invoker = true) AS
SELECT cl.id, c.numero AS commande, cli.nom AS client, cl.description,
       cl.technique, m.nom AS machine, s.nom AS support, cl.quantite,
       cl.statut_production, cl.priorite, c.urgent,
       c.date_livraison_prevue, cl.instructions, p.nom_complet AS operateur
FROM commande_lignes cl
JOIN commandes c   ON c.id = cl.commande_id
JOIN clients cli   ON cli.id = c.client_id
LEFT JOIN machines m ON m.id = cl.machine_id
LEFT JOIN supports s ON s.id = cl.support_id
LEFT JOIN profils p  ON p.id = cl.operateur_id
WHERE c.statut IN ('bat_valide', 'en_production')
  AND cl.statut_production <> 'termine'
ORDER BY c.urgent DESC, cl.priorite DESC, c.date_livraison_prevue NULLS LAST;

-- Supports sous le seuil d'alerte
CREATE OR REPLACE VIEW v_alertes_stock WITH (security_invoker = true) AS
SELECT id, nom, categorie, unite, stock_actuel, seuil_alerte, fournisseur
FROM supports
WHERE actif AND stock_actuel <= seuil_alerte;

-- Factures impayées
CREATE OR REPLACE VIEW v_impayes WITH (security_invoker = true) AS
SELECT f.id, f.numero, cli.nom AS client, cli.telephone, f.date_facture,
       f.date_echeance, f.total_ttc, f.montant_paye,
       f.total_ttc - f.montant_paye AS reste_a_payer,
       greatest(current_date - f.date_echeance, 0) AS jours_retard
FROM factures f
JOIN clients cli ON cli.id = f.client_id
WHERE f.statut IN ('emise', 'partiellement_payee');


-- ---------------------------------------------------------------------
-- 10. SÉCURITÉ : accès selon le rôle (Row Level Security)
-- ---------------------------------------------------------------------

-- Rôle de l'utilisateur connecté (NULL si compte inactif)
CREATE OR REPLACE FUNCTION role_actuel() RETURNS role_utilisateur
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM profils WHERE id = auth.uid() AND actif;
$$;

CREATE OR REPLACE FUNCTION a_role(VARIADIC p_roles role_utilisateur[]) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(role_actuel() = ANY (p_roles), false);
$$;

-- Activation de la sécurité sur toutes les tables
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['profils','parametres','compteurs','clients','machines','supports',
                           'finitions','devis','devis_lignes','devis_ligne_finitions',
                           'commandes','commande_lignes','bat','factures','paiements',
                           'mouvements_stock'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- Politiques : lecture / écriture par rôle
-- (lecture = tout utilisateur actif, sauf finances ; écriture selon le métier)
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      -- table,                 lecture,                                   écriture
      ('parametres',            'role_actuel() IS NOT NULL',               'a_role(''gerant'')'),
      ('machines',              'role_actuel() IS NOT NULL',               'a_role(''gerant'')'),
      ('supports',              'role_actuel() IS NOT NULL',               'a_role(''gerant'')'),
      ('finitions',             'role_actuel() IS NOT NULL',               'a_role(''gerant'')'),
      ('clients',               'role_actuel() IS NOT NULL',               'a_role(''gerant'',''accueil'',''compta'')'),
      ('devis',                 'a_role(''gerant'',''accueil'',''compta'')', 'a_role(''gerant'',''accueil'')'),
      ('devis_lignes',          'a_role(''gerant'',''accueil'',''compta'')', 'a_role(''gerant'',''accueil'')'),
      ('devis_ligne_finitions', 'a_role(''gerant'',''accueil'',''compta'')', 'a_role(''gerant'',''accueil'')'),
      ('commandes',             'role_actuel() IS NOT NULL',               'a_role(''gerant'',''accueil'',''atelier'')'),
      ('commande_lignes',       'role_actuel() IS NOT NULL',               'a_role(''gerant'',''accueil'',''atelier'')'),
      ('bat',                   'role_actuel() IS NOT NULL',               'a_role(''gerant'',''accueil'')'),
      ('factures',              'a_role(''gerant'',''accueil'',''compta'')', 'a_role(''gerant'',''compta'')'),
      ('paiements',             'a_role(''gerant'',''accueil'',''compta'')', 'a_role(''gerant'',''accueil'',''compta'')'),
      ('mouvements_stock',      'role_actuel() IS NOT NULL',               'role_actuel() IS NOT NULL')
    ) AS v(tbl, lecture, ecriture)
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS lecture ON %I', r.tbl);
    EXECUTE format('DROP POLICY IF EXISTS ajout ON %I', r.tbl);
    EXECUTE format('DROP POLICY IF EXISTS modification ON %I', r.tbl);
    EXECUTE format('DROP POLICY IF EXISTS suppression ON %I', r.tbl);

    EXECUTE format('CREATE POLICY lecture ON %I FOR SELECT TO authenticated USING (%s)', r.tbl, r.lecture);
    EXECUTE format('CREATE POLICY ajout ON %I FOR INSERT TO authenticated WITH CHECK (%s)', r.tbl, r.ecriture);
    EXECUTE format('CREATE POLICY modification ON %I FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)', r.tbl, r.ecriture, r.ecriture);
    -- Suppression réservée au gérant (sauf mouvements de stock : jamais supprimés)
    IF r.tbl <> 'mouvements_stock' THEN
      EXECUTE format('CREATE POLICY suppression ON %I FOR DELETE TO authenticated USING (a_role(''gerant''))', r.tbl);
    END IF;
  END LOOP;
END $$;

-- Profils : chacun voit les profils actifs ; seul le gérant modifie les rôles
DROP POLICY IF EXISTS lecture ON profils;
DROP POLICY IF EXISTS modification ON profils;
CREATE POLICY lecture ON profils FOR SELECT TO authenticated
  USING (id = auth.uid() OR role_actuel() IS NOT NULL);
CREATE POLICY modification ON profils FOR UPDATE TO authenticated
  USING (a_role('gerant')) WITH CHECK (a_role('gerant'));

-- Compteurs : aucun accès direct (uniquement via prochain_numero)


-- ---------------------------------------------------------------------
-- 11. DONNÉES DE DÉPART (à ajuster dans l'application)
-- ---------------------------------------------------------------------
INSERT INTO parametres (cle, valeur, description) VALUES
  ('nom_imprimerie',    'Mon Imprimerie', 'Nom affiché sur les devis et factures'),
  ('devise',            'À définir',      'Code de la devise, ex. EUR, XOF, MRU (à ajuster)'),
  ('taux_tva',          '0',              'Taux de TVA en % (à ajuster)'),
  ('marge_defaut_pct',  '30',             'Marge appliquée par défaut sur le coût de revient'),
  ('validite_devis_j',  '30',             'Durée de validité des devis en jours'),
  ('delai_paiement_j',  '30',             'Échéance par défaut des factures en jours')
ON CONFLICT (cle) DO NOTHING;

-- =====================================================================
--  APRÈS EXÉCUTION — créer le compte du gérant :
--  1. Supabase > Authentication > Users > Add user (ton e-mail + mot de passe)
--  2. Puis lancer, en remplaçant l'e-mail :
--
--     UPDATE profils SET role = 'gerant', actif = true, nom_complet = 'Ton nom'
--     WHERE id = (SELECT id FROM auth.users WHERE email = 'ton.email@exemple.com');
--
--  Les autres utilisateurs seront ensuite activés depuis l'application.
-- =====================================================================
