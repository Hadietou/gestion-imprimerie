-- =====================================================================
--  GESTION IMPRIMERIE — Encres et consommables dans le stock
--
--  Ajoute les catégories « encre » et « consommable » et les unités
--  d'achat courantes (ramette, rouleau, litre, kg).
--
--  ⚠ À exécuter SEUL, puis lancer sql/05_donnees_depart.sql dans une
--    nouvelle requête : PostgreSQL n'autorise pas l'utilisation d'une
--    nouvelle valeur d'ENUM dans la même exécution que sa création.
--
--  Supabase > SQL Editor > New query > coller > Run (script rejouable)
-- =====================================================================

ALTER TYPE categorie_support ADD VALUE IF NOT EXISTS 'encre';
ALTER TYPE categorie_support ADD VALUE IF NOT EXISTS 'consommable';

ALTER TYPE unite_support ADD VALUE IF NOT EXISTS 'ramette';
ALTER TYPE unite_support ADD VALUE IF NOT EXISTS 'rouleau';
ALTER TYPE unite_support ADD VALUE IF NOT EXISTS 'litre';
ALTER TYPE unite_support ADD VALUE IF NOT EXISTS 'kg';
