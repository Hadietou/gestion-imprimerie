-- =====================================================================
--  GESTION IMPRIMERIE — Étape 4 bis : catalogue de produits et prix de vente
--
--  Les devis se font à partir d'une grille de prix de vente (pratique du
--  marché), et non à partir des coûts machine.
--
--  À exécuter APRÈS sql/02_utilisateurs.sql
--  Supabase > SQL Editor > New query > coller > Run (script rejouable)
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Mode de prix d'un produit
--    forfait            : un prix pour le travail
--    par_unite          : prix par exemplaire / pièce
--    par_m2             : prix au m²
--    par_metre_lineaire : prix au mètre linéaire
--    par_mille          : prix pour 1 000 exemplaires
--    par_lot            : prix total par quantité (100 ex. = X, 500 ex. = Y…)
-- ---------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE mode_prix AS ENUM
    ('forfait', 'par_unite', 'par_m2', 'par_metre_lineaire', 'par_mille', 'par_lot');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ---------------------------------------------------------------------
-- 2. Produits vendus
--    paliers : liste JSON triée [{ "quantite": 100, "prix": 3000 }, …]
--      - par_lot : prix TOTAL pour la quantité du palier
--      - autres modes : prix UNITAIRE applicable « à partir de » cette quantité
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS produits (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nom               text NOT NULL,                  -- ex. "Carte de visite 85×55 recto/verso"
  technique         technique_impression NOT NULL,
  mode_prix         mode_prix NOT NULL DEFAULT 'par_unite',
  prix              numeric(14,2) NOT NULL DEFAULT 0,  -- prix de base (inutilisé pour par_lot)
  quantite_minimum  numeric(14,2) NOT NULL DEFAULT 0,  -- minimum facturé (ex. 1 m²)
  paliers           jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(paliers) = 'array'),
  description       text,                           -- détail repris sur le devis (papier, format…)
  actif             boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_produits_nom ON produits (lower(nom));

DROP TRIGGER IF EXISTS trg_produits_updated ON produits;
CREATE TRIGGER trg_produits_updated BEFORE UPDATE ON produits
  FOR EACH ROW EXECUTE FUNCTION maj_updated_at();


-- ---------------------------------------------------------------------
-- 3. Sécurité : lecture pour tous les utilisateurs actifs, écriture gérant
-- ---------------------------------------------------------------------
ALTER TABLE produits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lecture ON produits;
DROP POLICY IF EXISTS ajout ON produits;
DROP POLICY IF EXISTS modification ON produits;
DROP POLICY IF EXISTS suppression ON produits;

CREATE POLICY lecture ON produits FOR SELECT TO authenticated USING (role_actuel() IS NOT NULL);
CREATE POLICY ajout ON produits FOR INSERT TO authenticated WITH CHECK (a_role('gerant'));
CREATE POLICY modification ON produits FOR UPDATE TO authenticated
  USING (a_role('gerant')) WITH CHECK (a_role('gerant'));
CREATE POLICY suppression ON produits FOR DELETE TO authenticated USING (a_role('gerant'));
