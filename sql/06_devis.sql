-- =====================================================================
--  GESTION IMPRIMERIE — Étape 6 : devis
--
--  - Lien entre une ligne de devis et le produit de la grille de prix
--  - Enregistrement d'un devis complet (en-tête + lignes + finitions)
--    en une seule transaction
--
--  À exécuter APRÈS sql/05_donnees_depart.sql
--  Supabase > SQL Editor > New query > coller > Run (script rejouable)
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Produit de la grille utilisé par la ligne (NULL = ligne libre)
-- ---------------------------------------------------------------------
ALTER TABLE devis_lignes ADD COLUMN IF NOT EXISTS produit_id bigint REFERENCES produits(id);
ALTER TABLE commande_lignes ADD COLUMN IF NOT EXISTS produit_id bigint REFERENCES produits(id);


-- ---------------------------------------------------------------------
-- 2. enregistrer_devis(p_devis, p_lignes) → id du devis
--
--  p_devis  : { id?, client_id, date_devis, validite_jours, objet,
--               remise_pct, taux_tva, notes }
--  p_lignes : [ { description, technique, produit_id?, quantite,
--                 largeur_mm?, hauteur_mm?, detail_calcul, prix_total_ht,
--                 finitions: [ { finition_id, quantite, montant } ] } ]
--
--  Les lignes existantes sont remplacées. SECURITY DEFINER car la
--  suppression des lignes est réservée au gérant par la RLS : le droit
--  d'écriture (gérant, accueil) est donc vérifié ici explicitement.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION enregistrer_devis(p_devis jsonb, p_lignes jsonb)
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id       bigint := nullif(p_devis->>'id', '')::bigint;
  v_tva      numeric := coalesce(nullif(p_devis->>'taux_tva', '')::numeric, 0);
  v_ligne    jsonb;
  v_ligne_id bigint;
  v_finition jsonb;
  v_ordre    int := 0;
BEGIN
  IF NOT a_role('gerant', 'accueil') THEN
    RAISE EXCEPTION 'Vous n''avez pas les droits pour modifier les devis.' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_lignes) <> 'array' OR jsonb_array_length(p_lignes) = 0 THEN
    RAISE EXCEPTION 'Le devis doit contenir au moins une ligne.';
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO devis (client_id, date_devis, validite_jours, objet, remise_pct, taux_tva, notes)
    VALUES (
      (p_devis->>'client_id')::bigint,
      coalesce(nullif(p_devis->>'date_devis', '')::date, current_date),
      coalesce(nullif(p_devis->>'validite_jours', '')::int, 30),
      nullif(p_devis->>'objet', ''),
      coalesce(nullif(p_devis->>'remise_pct', '')::numeric, 0),
      v_tva,
      nullif(p_devis->>'notes', '')
    )
    RETURNING id INTO v_id;
  ELSE
    UPDATE devis SET
      client_id      = (p_devis->>'client_id')::bigint,
      date_devis     = coalesce(nullif(p_devis->>'date_devis', '')::date, date_devis),
      validite_jours = coalesce(nullif(p_devis->>'validite_jours', '')::int, validite_jours),
      objet          = nullif(p_devis->>'objet', ''),
      remise_pct     = coalesce(nullif(p_devis->>'remise_pct', '')::numeric, 0),
      notes          = nullif(p_devis->>'notes', '')
    WHERE id = v_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Devis introuvable.';
    END IF;
    DELETE FROM devis_lignes WHERE devis_id = v_id;
  END IF;

  -- TVA voulue (le déclencheur d'insertion remplace un taux 0 par le taux par défaut)
  UPDATE devis SET taux_tva = v_tva WHERE id = v_id AND taux_tva IS DISTINCT FROM v_tva;

  FOR v_ligne IN SELECT * FROM jsonb_array_elements(p_lignes) LOOP
    v_ordre := v_ordre + 1;
    INSERT INTO devis_lignes (devis_id, ordre, description, technique, produit_id, quantite,
                              largeur_mm, hauteur_mm, detail_calcul, prix_total_ht)
    VALUES (
      v_id,
      v_ordre,
      v_ligne->>'description',
      (v_ligne->>'technique')::technique_impression,
      nullif(v_ligne->>'produit_id', '')::bigint,
      (v_ligne->>'quantite')::int,
      nullif(v_ligne->>'largeur_mm', '')::int,
      nullif(v_ligne->>'hauteur_mm', '')::int,
      coalesce(v_ligne->'detail_calcul', '{}'::jsonb),
      coalesce(nullif(v_ligne->>'prix_total_ht', '')::numeric, 0)
    )
    RETURNING id INTO v_ligne_id;

    FOR v_finition IN SELECT * FROM jsonb_array_elements(coalesce(v_ligne->'finitions', '[]'::jsonb)) LOOP
      INSERT INTO devis_ligne_finitions (devis_ligne_id, finition_id, quantite, montant)
      VALUES (
        v_ligne_id,
        (v_finition->>'finition_id')::bigint,
        coalesce(nullif(v_finition->>'quantite', '')::numeric, 1),
        coalesce(nullif(v_finition->>'montant', '')::numeric, 0)
      );
    END LOOP;
  END LOOP;

  PERFORM recalculer_devis(v_id);
  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION enregistrer_devis(jsonb, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION enregistrer_devis(jsonb, jsonb) TO authenticated;
