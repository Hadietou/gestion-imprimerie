-- =====================================================================
--  GESTION IMPRIMERIE — Étape 10 : factures et paiements
--
--  - Facture créée à partir d'une commande (montants, remise, TVA)
--  - L'acompte de la commande devient un premier paiement
--  - Statut et montant payé suivent les paiements (déclencheur du schéma)
--
--  À exécuter APRÈS sql/08_commandes.sql
--  Supabase > SQL Editor > New query > coller > Run (script rejouable)
-- =====================================================================


-- Une seule facture active (non annulée) par commande
CREATE UNIQUE INDEX IF NOT EXISTS idx_factures_une_commande ON factures (commande_id)
  WHERE commande_id IS NOT NULL AND statut <> 'annulee';


-- ---------------------------------------------------------------------
-- creer_facture_depuis_commande(commande) → id de la facture
--   Gérant, compta et accueil (qui livre et facture au comptoir).
--   Si la commande a déjà une facture active, on la renvoie.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION creer_facture_depuis_commande(p_commande_id bigint)
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_facture  bigint;
  v_commande commandes%ROWTYPE;
  v_brut     numeric(14,2);
  v_ht       numeric(14,2);
  v_ttc      numeric(14,2);
  v_delai    int;
BEGIN
  IF NOT a_role('gerant', 'compta', 'accueil') THEN
    RAISE EXCEPTION 'Vous n''avez pas les droits pour créer une facture.' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_facture FROM factures WHERE commande_id = p_commande_id AND statut <> 'annulee';
  IF v_facture IS NOT NULL THEN
    RETURN v_facture;
  END IF;

  SELECT * INTO v_commande FROM commandes WHERE id = p_commande_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Commande introuvable.';
  END IF;
  IF v_commande.statut = 'annule' THEN
    RAISE EXCEPTION 'Cette commande est annulée.';
  END IF;

  SELECT coalesce(sum(prix_total_ht), 0) INTO v_brut FROM commande_lignes WHERE commande_id = p_commande_id;
  v_ht := round(v_brut * (1 - v_commande.remise_pct / 100), 2);
  SELECT coalesce(nullif(valeur, '')::int, 30) INTO v_delai FROM parametres WHERE cle = 'delai_paiement_j';

  INSERT INTO factures (commande_id, client_id, statut, date_facture, date_echeance, total_ht, taux_tva, notes)
  VALUES (p_commande_id, v_commande.client_id, 'emise', current_date,
          current_date + coalesce(v_delai, 30), v_ht, v_commande.taux_tva, v_commande.objet)
  RETURNING id INTO v_facture;

  -- TVA voulue (le déclencheur d'insertion remplace un taux 0 par le taux par défaut)
  UPDATE factures SET taux_tva = v_commande.taux_tva
  WHERE id = v_facture AND taux_tva IS DISTINCT FROM v_commande.taux_tva;

  -- L'acompte versé à la commande devient le premier paiement
  SELECT total_ttc INTO v_ttc FROM factures WHERE id = v_facture;
  IF v_commande.acompte > 0 AND v_ttc > 0 THEN
    INSERT INTO paiements (facture_id, date_paiement, montant, mode, reference)
    VALUES (v_facture, v_commande.date_commande, least(v_commande.acompte, v_ttc), 'autre',
            'Acompte versé à la commande ' || v_commande.numero);
  END IF;

  RETURN v_facture;
END $$;

REVOKE ALL ON FUNCTION creer_facture_depuis_commande(bigint) FROM public, anon;
GRANT EXECUTE ON FUNCTION creer_facture_depuis_commande(bigint) TO authenticated;
