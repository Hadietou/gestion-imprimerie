-- =====================================================================
--  GESTION IMPRIMERIE — Étape 2 : gestion des utilisateurs
--
--  À exécuter APRÈS imprimerie_schema.sql
--  Supabase > SQL Editor > New query > coller > Run (script rejouable)
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Liste des utilisateurs avec leur e-mail (réservée au gérant)
--    L'e-mail est stocké dans auth.users, inaccessible depuis l'application :
--    cette fonction l'expose uniquement au gérant actif.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION liste_utilisateurs()
RETURNS TABLE (
  id                 uuid,
  email              text,
  nom_complet        text,
  role               role_utilisateur,
  actif              boolean,
  created_at         timestamptz,
  derniere_connexion timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, u.email::text, p.nom_complet, p.role, p.actif, p.created_at, u.last_sign_in_at
  FROM profils p
  JOIN auth.users u ON u.id = p.id
  WHERE a_role('gerant')
  ORDER BY p.actif, p.nom_complet;
$$;

REVOKE ALL ON FUNCTION liste_utilisateurs() FROM public, anon;
GRANT EXECUTE ON FUNCTION liste_utilisateurs() TO authenticated;


-- ---------------------------------------------------------------------
-- 2. Garde-fou : il doit toujours rester au moins un gérant actif
--    (évite que le gérant se retire ses propres droits par erreur)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION proteger_dernier_gerant() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.role = 'gerant' AND OLD.actif
     AND (NEW.role <> 'gerant' OR NOT NEW.actif) THEN
    IF NOT EXISTS (
      SELECT 1 FROM profils WHERE role = 'gerant' AND actif AND id <> OLD.id
    ) THEN
      RAISE EXCEPTION 'Il doit rester au moins un gérant actif.';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_proteger_dernier_gerant ON profils;
CREATE TRIGGER trg_proteger_dernier_gerant BEFORE UPDATE OF role, actif ON profils
  FOR EACH ROW EXECUTE FUNCTION proteger_dernier_gerant();
