-- =====================================================================
--  GESTION IMPRIMERIE — Étape 7 : dépenses de fonctionnement
--
--  - Catégories de dépenses (modifiables par le gérant)
--  - Dépenses (électricité, salaires, loyer, achats…)
--  - Les achats de papier / encres / consommables font entrer les
--    articles en stock (mouvements_stock reliés à la dépense)
--
--  À exécuter APRÈS sql/06_devis.sql
--  Supabase > SQL Editor > New query > coller > Run (script rejouable)
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Catégories
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categories_depense (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nom         text NOT NULL UNIQUE,
  achat_stock boolean NOT NULL DEFAULT false,   -- vrai : la dépense fait entrer des articles en stock
  ordre       int NOT NULL DEFAULT 100,
  actif       boolean NOT NULL DEFAULT true
);

INSERT INTO categories_depense (nom, achat_stock, ordre) VALUES
  ('Achats papier, encres & consommables', true,  1),
  ('Salaires et primes',                    false, 2),
  ('Loyer',                                 false, 3),
  ('Électricité',                           false, 4),
  ('Eau',                                   false, 5),
  ('Internet et téléphone',                 false, 6),
  ('Carburant et transport',                false, 7),
  ('Entretien et réparations',              false, 8),
  ('Sous-traitance',                        false, 9),
  ('Impôts et taxes',                       false, 10),
  ('Banque et frais financiers',            false, 11),
  ('Divers',                                false, 99)
ON CONFLICT (nom) DO NOTHING;


-- ---------------------------------------------------------------------
-- 2. Dépenses
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS depenses (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  date_depense  date NOT NULL DEFAULT current_date,
  categorie_id  bigint NOT NULL REFERENCES categories_depense(id),
  libelle       text NOT NULL,                       -- ex. « Facture SOMELEC septembre »
  montant       numeric(14,2) NOT NULL CHECK (montant > 0),
  mode          mode_paiement NOT NULL DEFAULT 'especes',
  beneficiaire  text,                                -- fournisseur, salarié…
  reference     text,                                -- n° de facture, de reçu…
  notes         text,
  created_by    uuid REFERENCES profils(id) DEFAULT auth.uid(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_depenses_date ON depenses (date_depense);

DROP TRIGGER IF EXISTS trg_depenses_updated ON depenses;
CREATE TRIGGER trg_depenses_updated BEFORE UPDATE ON depenses
  FOR EACH ROW EXECUTE FUNCTION maj_updated_at();

-- Entrées en stock provenant d'un achat (une dépense liée au stock ne peut pas être supprimée)
ALTER TABLE mouvements_stock ADD COLUMN IF NOT EXISTS depense_id bigint REFERENCES depenses(id);
CREATE INDEX IF NOT EXISTS idx_mvt_depense ON mouvements_stock (depense_id);


-- ---------------------------------------------------------------------
-- 3. Sécurité : gérant et compta ; suppression réservée au gérant
-- ---------------------------------------------------------------------
ALTER TABLE categories_depense ENABLE ROW LEVEL SECURITY;
ALTER TABLE depenses ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('categories_depense', 'a_role(''gerant'',''compta'')', 'a_role(''gerant'')'),
    ('depenses',           'a_role(''gerant'',''compta'')', 'a_role(''gerant'',''compta'')')
  ) AS v(tbl, lecture, ecriture)
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS lecture ON %I', r.tbl);
    EXECUTE format('DROP POLICY IF EXISTS ajout ON %I', r.tbl);
    EXECUTE format('DROP POLICY IF EXISTS modification ON %I', r.tbl);
    EXECUTE format('DROP POLICY IF EXISTS suppression ON %I', r.tbl);
    EXECUTE format('CREATE POLICY lecture ON %I FOR SELECT TO authenticated USING (%s)', r.tbl, r.lecture);
    EXECUTE format('CREATE POLICY ajout ON %I FOR INSERT TO authenticated WITH CHECK (%s)', r.tbl, r.ecriture);
    EXECUTE format('CREATE POLICY modification ON %I FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)', r.tbl, r.ecriture, r.ecriture);
    EXECUTE format('CREATE POLICY suppression ON %I FOR DELETE TO authenticated USING (a_role(''gerant''))', r.tbl);
  END LOOP;
END $$;


-- ---------------------------------------------------------------------
-- 4. enregistrer_depense(p_depense, p_articles) → id de la dépense
--
--  p_depense  : { id?, date_depense, categorie_id, libelle, montant, mode,
--                 beneficiaire, reference, notes }
--  p_articles : [ { support_id, quantite, prix_unitaire } ]  (création seulement)
--
--  À la création, chaque article entre en stock (mouvement « entree » relié
--  à la dépense) et son prix d'achat devient le dernier prix payé.
--  En modification, les entrées en stock déjà faites ne changent pas.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION enregistrer_depense(p_depense jsonb, p_articles jsonb DEFAULT '[]')
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id      bigint := nullif(p_depense->>'id', '')::bigint;
  v_article jsonb;
  v_libelle text := nullif(trim(p_depense->>'libelle'), '');
BEGIN
  IF NOT a_role('gerant', 'compta') THEN
    RAISE EXCEPTION 'Vous n''avez pas les droits pour saisir des dépenses.' USING ERRCODE = '42501';
  END IF;
  IF v_libelle IS NULL THEN
    RAISE EXCEPTION 'Le libellé est obligatoire.';
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO depenses (date_depense, categorie_id, libelle, montant, mode, beneficiaire, reference, notes)
    VALUES (
      coalesce(nullif(p_depense->>'date_depense', '')::date, current_date),
      (p_depense->>'categorie_id')::bigint,
      v_libelle,
      (p_depense->>'montant')::numeric,
      coalesce(nullif(p_depense->>'mode', ''), 'especes')::mode_paiement,
      nullif(trim(p_depense->>'beneficiaire'), ''),
      nullif(trim(p_depense->>'reference'), ''),
      nullif(trim(p_depense->>'notes'), '')
    )
    RETURNING id INTO v_id;

    FOR v_article IN SELECT * FROM jsonb_array_elements(coalesce(p_articles, '[]'::jsonb)) LOOP
      IF coalesce((v_article->>'quantite')::numeric, 0) <= 0 THEN
        RAISE EXCEPTION 'Chaque article doit avoir une quantité supérieure à 0.';
      END IF;
      INSERT INTO mouvements_stock (support_id, type, quantite, motif, depense_id)
      VALUES ((v_article->>'support_id')::bigint, 'entree', (v_article->>'quantite')::numeric,
              'Achat — ' || v_libelle, v_id);
      IF coalesce((v_article->>'prix_unitaire')::numeric, 0) > 0 THEN
        UPDATE supports SET prix_unitaire = (v_article->>'prix_unitaire')::numeric
        WHERE id = (v_article->>'support_id')::bigint;
      END IF;
    END LOOP;
  ELSE
    UPDATE depenses SET
      date_depense = coalesce(nullif(p_depense->>'date_depense', '')::date, date_depense),
      categorie_id = (p_depense->>'categorie_id')::bigint,
      libelle      = v_libelle,
      montant      = (p_depense->>'montant')::numeric,
      mode         = coalesce(nullif(p_depense->>'mode', ''), 'especes')::mode_paiement,
      beneficiaire = nullif(trim(p_depense->>'beneficiaire'), ''),
      reference    = nullif(trim(p_depense->>'reference'), ''),
      notes        = nullif(trim(p_depense->>'notes'), '')
    WHERE id = v_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Dépense introuvable.';
    END IF;
  END IF;

  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION enregistrer_depense(jsonb, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION enregistrer_depense(jsonb, jsonb) TO authenticated;
