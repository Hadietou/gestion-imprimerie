-- =====================================================================
--  GESTION IMPRIMERIE — Étape 9 : commandes, BAT et production
--
--  - Commande créée à partir d'un devis (lignes, finitions, remise, TVA)
--  - Le statut de la commande suit les BAT et l'avancement de l'atelier
--
--  À exécuter APRÈS sql/07_depenses.sql
--  Supabase > SQL Editor > New query > coller > Run (script rejouable)
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Compléments à la table commandes (repris du devis, pour la facture)
-- ---------------------------------------------------------------------
ALTER TABLE commandes ADD COLUMN IF NOT EXISTS objet      text;
ALTER TABLE commandes ADD COLUMN IF NOT EXISTS remise_pct numeric(5,2) NOT NULL DEFAULT 0;
ALTER TABLE commandes ADD COLUMN IF NOT EXISTS taux_tva   numeric(5,2) NOT NULL DEFAULT 0;

-- Une seule commande active par devis
CREATE UNIQUE INDEX IF NOT EXISTS idx_commandes_un_devis ON commandes (devis_id)
  WHERE devis_id IS NOT NULL AND statut <> 'annule';


-- ---------------------------------------------------------------------
-- 2. creer_commande_depuis_devis(devis, livraison prévue, urgent) → id
--    Si le devis a déjà une commande active, on la renvoie.
--    Le devis passe à « accepté ».
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION creer_commande_depuis_devis(
  p_devis_id bigint,
  p_date_livraison date DEFAULT NULL,
  p_urgent boolean DEFAULT false
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_commande bigint;
  v_devis    devis%ROWTYPE;
BEGIN
  IF NOT a_role('gerant', 'accueil') THEN
    RAISE EXCEPTION 'Vous n''avez pas les droits pour créer une commande.' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_commande FROM commandes WHERE devis_id = p_devis_id AND statut <> 'annule';
  IF v_commande IS NOT NULL THEN
    RETURN v_commande;
  END IF;

  SELECT * INTO v_devis FROM devis WHERE id = p_devis_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Devis introuvable.';
  END IF;

  INSERT INTO commandes (devis_id, client_id, objet, remise_pct, taux_tva, date_livraison_prevue, urgent, notes)
  VALUES (v_devis.id, v_devis.client_id, v_devis.objet, v_devis.remise_pct, v_devis.taux_tva,
          p_date_livraison, coalesce(p_urgent, false), v_devis.notes)
  RETURNING id INTO v_commande;

  -- Lignes : la liste des finitions devient la consigne de l'atelier
  INSERT INTO commande_lignes (commande_id, devis_ligne_id, produit_id, description, technique,
                               quantite, prix_total_ht, instructions)
  SELECT v_commande, dl.id, dl.produit_id,
         dl.description
           || CASE WHEN dl.largeur_mm IS NOT NULL AND dl.hauteur_mm IS NOT NULL
                   THEN E'\nFormat : ' || replace(trim_scale(dl.largeur_mm / 10.0)::text, '.', ',')
                        || ' × ' || replace(trim_scale(dl.hauteur_mm / 10.0)::text, '.', ',') || ' cm'
                   ELSE '' END,
         dl.technique, dl.quantite, dl.prix_total_ht,
         (SELECT 'Finitions : ' || string_agg(f.nom, ', ' ORDER BY dlf.id)
            FROM devis_ligne_finitions dlf JOIN finitions f ON f.id = dlf.finition_id
           WHERE dlf.devis_ligne_id = dl.id)
  FROM devis_lignes dl
  WHERE dl.devis_id = v_devis.id
  ORDER BY dl.ordre;

  UPDATE devis SET statut = 'accepte' WHERE id = v_devis.id AND statut <> 'accepte';
  RETURN v_commande;
END $$;

REVOKE ALL ON FUNCTION creer_commande_depuis_devis(bigint, date, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION creer_commande_depuis_devis(bigint, date, boolean) TO authenticated;


-- ---------------------------------------------------------------------
-- 3. Statut de la commande suivant les BAT
--    BAT envoyé → bat_envoye ; validé → bat_valide ; refusé → attente_bat
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION maj_commande_bat() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE commandes SET statut = CASE NEW.statut
      WHEN 'envoye' THEN 'bat_envoye'::statut_commande
      WHEN 'valide' THEN 'bat_valide'::statut_commande
      WHEN 'refuse' THEN 'attente_bat'::statut_commande
    END
  WHERE id = NEW.commande_id AND statut IN ('attente_bat', 'bat_envoye', 'bat_valide');
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_bat_commande ON bat;
CREATE TRIGGER trg_bat_commande AFTER INSERT OR UPDATE OF statut ON bat
  FOR EACH ROW EXECUTE FUNCTION maj_commande_bat();


-- ---------------------------------------------------------------------
-- 4. Statut de la commande suivant l'atelier
--    une ligne démarrée → en_production ; toutes terminées → termine
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION maj_commande_production() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_total    int;
  v_termines int;
  v_actives  int;
BEGIN
  SELECT count(*),
         count(*) FILTER (WHERE statut_production = 'termine'),
         count(*) FILTER (WHERE statut_production IN ('en_cours', 'termine'))
    INTO v_total, v_termines, v_actives
  FROM commande_lignes WHERE commande_id = NEW.commande_id;

  IF v_total > 0 AND v_termines = v_total THEN
    UPDATE commandes SET statut = 'termine'
    WHERE id = NEW.commande_id AND statut IN ('bat_valide', 'en_production');
  ELSIF v_actives > 0 THEN
    UPDATE commandes SET statut = 'en_production'
    WHERE id = NEW.commande_id AND statut IN ('bat_valide', 'termine');
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_lignes_production ON commande_lignes;
CREATE TRIGGER trg_lignes_production AFTER UPDATE OF statut_production ON commande_lignes
  FOR EACH ROW EXECUTE FUNCTION maj_commande_production();
