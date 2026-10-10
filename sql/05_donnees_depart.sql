-- =====================================================================
--  GESTION IMPRIMERIE — Données de départ : finitions et fournitures
--
--  Finitions et fournitures (papiers, supports, encres, consommables)
--  les plus courantes, avec des PRIX INDICATIFS à corriger dans
--  l'application (Tarifs & catalogue).
--
--  À exécuter APRÈS sql/04_encres_consommables.sql (dans une autre requête).
--  Rejouable : un élément dont le nom existe déjà n'est pas recréé
--  (vos corrections ne sont donc jamais écrasées).
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. FINITIONS (prix de VENTE, ajoutés au produit dans le devis)
--    mode : forfait | par_unite | par_m2 | par_mille
-- ---------------------------------------------------------------------
INSERT INTO finitions (nom, techniques, mode_calcul, prix, cout_fixe)
SELECT v.nom, v.techniques::technique_impression[], v.mode::mode_calcul_finition, v.prix, v.cout_fixe
FROM (VALUES
  -- Façonnage papier (numérique / offset)
  ('Pelliculage mat recto',             '{numerique,offset}',              'par_mille', 15000,    0),
  ('Pelliculage brillant recto',        '{numerique,offset}',              'par_mille', 15000,    0),
  ('Pelliculage mat recto/verso',       '{numerique,offset}',              'par_mille', 25000,    0),
  ('Vernis sélectif',                   '{numerique,offset}',              'par_mille', 25000, 5000),
  ('Coins arrondis',                    '{numerique,offset}',              'par_mille',  3000,    0),
  ('Rainage / pliage',                  '{numerique,offset}',              'par_mille',  4000,    0),
  ('Perforation (détachable)',          '{numerique,offset}',              'par_mille',  3000,    0),
  ('Numérotation',                      '{numerique,offset}',              'par_mille',  5000,    0),
  ('Découpe à la forme',                '{numerique,offset}',              'par_mille', 10000, 5000),
  ('Mise en carnet / liasse',           '{numerique,offset}',              'par_unite',   500,    0),
  ('Agrafage (piqûre à cheval)',        '{numerique,offset}',              'par_mille',  8000,    0),
  ('Reliure spirale',                   '{numerique,offset}',              'par_unite',   500,    0),
  ('Reliure dos carré collé',           '{numerique,offset}',              'par_unite',  1000,    0),
  ('Massicotage / coupe',               '{numerique,offset}',              'forfait',     500,    0),
  -- Grand format
  ('Œillets (pose)',                    '{grand_format}',                  'par_m2',      500,    0),
  ('Ourlet / soudure de bâche',         '{grand_format}',                  'par_m2',      500,    0),
  ('Plastification grand format',       '{grand_format}',                  'par_m2',     1500,    0),
  ('Contrecollage sur Forex / Akilux',  '{grand_format}',                  'par_m2',     2500,    0),
  ('Découpe vinyle (lettrage)',         '{grand_format}',                  'par_m2',     3000,    0),
  ('Pose / installation sur site',      '{grand_format}',                  'forfait',   10000,    0),
  -- Sérigraphie
  ('Impression d’une couleur supplémentaire', '{serigraphie}',             'par_unite',   500, 2000),
  ('Emplacement supplémentaire (dos, manche)', '{serigraphie}',            'par_unite',   500, 2000),
  -- Toutes techniques
  ('Création graphique / maquette',     '{numerique,offset,grand_format,serigraphie}', 'forfait', 5000, 0),
  ('Retouche de fichier client',        '{numerique,offset,grand_format,serigraphie}', 'forfait', 2000, 0),
  ('Livraison',                         '{numerique,offset,grand_format,serigraphie}', 'forfait', 1000, 0)
) AS v(nom, techniques, mode, prix, cout_fixe)
WHERE NOT EXISTS (SELECT 1 FROM finitions f WHERE lower(f.nom) = lower(v.nom));


-- ---------------------------------------------------------------------
-- 2. PAPIERS, SUPPORTS, ENCRES ET CONSOMMABLES (prix d'ACHAT, pour le stock)
--    seuil : stock en dessous duquel une alerte apparaît (dans l'unité d'achat)
-- ---------------------------------------------------------------------
INSERT INTO supports (nom, categorie, grammage, largeur_mm, hauteur_mm, unite, prix_unitaire, seuil_alerte)
SELECT v.nom, v.categorie::categorie_support, v.grammage, v.largeur, v.hauteur, v.unite::unite_support,
       v.prix, v.seuil
FROM (VALUES
  -- Papiers (ramettes)
  ('Papier offset 80 g A4 (ramette 500 f.)',          'papier',      80,  210,  297, 'ramette',  2500, 10),
  ('Papier offset 80 g A3 (ramette 500 f.)',          'papier',      80,  297,  420, 'ramette',  5000,  5),
  ('Papier offset 80 g 65×92 (ramette 500 f.)',       'papier',      80,  650,  920, 'ramette', 15000,  2),
  ('Couché brillant 135 g SRA3 (ramette 250 f.)',     'papier',     135,  320,  450, 'ramette',  6000,  4),
  ('Couché mat 170 g SRA3 (ramette 250 f.)',          'papier',     170,  320,  450, 'ramette',  7000,  4),
  ('Couché brillant 250 g SRA3 (ramette 250 f.)',     'papier',     250,  320,  450, 'ramette',  9000,  3),
  ('Carte couchée 300 g SRA3 (ramette 125 f.)',       'papier',     300,  320,  450, 'ramette', 10000,  3),
  ('Papier autocopiant A4 (ramette 500 f.)',          'papier',    NULL,  210,  297, 'ramette',  6000,  2),
  ('Papier adhésif / étiquettes SRA3 (100 f.)',       'papier',    NULL,  320,  450, 'ramette',  8000,  2),
  ('Papier photo / poster 1,07 × 30 m',               'papier',     200, 1070, NULL, 'rouleau', 15000,  1),
  -- Bâches et vinyles (rouleaux)
  ('Bâche frontlit 440 g 3,20 × 50 m',                'bache',      440, 3200, NULL, 'rouleau', 45000,  1),
  ('Bâche frontlit 440 g 1,60 × 50 m',                'bache',      440, 1600, NULL, 'rouleau', 25000,  1),
  ('Vinyle adhésif blanc brillant 1,52 × 50 m',       'vinyle',    NULL, 1520, NULL, 'rouleau', 30000,  1),
  ('Vinyle adhésif transparent 1,52 × 50 m',          'vinyle',    NULL, 1520, NULL, 'rouleau', 32000,  1),
  ('Vinyle microperforé (vitrine) 1,37 × 50 m',       'vinyle',    NULL, 1370, NULL, 'rouleau', 40000,  1),
  -- Supports rigides
  ('Forex PVC 3 mm 122 × 244 cm',                     'rigide',    NULL, 1220, 2440, 'piece',    6000,  5),
  ('Akilux 3,5 mm 120 × 80 cm',                       'rigide',    NULL, 1200,  800, 'piece',    2500,  5),
  ('Plexiglas 3 mm 100 × 200 cm',                     'rigide',    NULL, 1000, 2000, 'piece',   25000,  2),
  ('Structure roll-up 85 × 200 cm',                   'rigide',    NULL,  850, 2000, 'piece',    8000,  3),
  -- Textiles (sérigraphie)
  ('T-shirt blanc coton 160 g',                       'textile',    160, NULL, NULL, 'piece',     600, 20),
  ('T-shirt couleur coton 160 g',                     'textile',    160, NULL, NULL, 'piece',     800, 20),
  ('Polo blanc',                                      'textile',   NULL, NULL, NULL, 'piece',    1500, 10),
  ('Casquette blanche',                               'textile',   NULL, NULL, NULL, 'piece',     700, 10),
  ('Sac / tote bag coton',                            'textile',   NULL, NULL, NULL, 'piece',     600, 10),
  -- Encres : numérique (toners)
  ('Toner noir (presse numérique)',                   'encre',     NULL, NULL, NULL, 'piece',   15000,  1),
  ('Toner cyan (presse numérique)',                   'encre',     NULL, NULL, NULL, 'piece',   18000,  1),
  ('Toner magenta (presse numérique)',                'encre',     NULL, NULL, NULL, 'piece',   18000,  1),
  ('Toner jaune (presse numérique)',                  'encre',     NULL, NULL, NULL, 'piece',   18000,  1),
  -- Encres : grand format éco-solvant
  ('Encre éco-solvant cyan 1 L',                      'encre',     NULL, NULL, NULL, 'litre',    9000,  1),
  ('Encre éco-solvant magenta 1 L',                   'encre',     NULL, NULL, NULL, 'litre',    9000,  1),
  ('Encre éco-solvant jaune 1 L',                     'encre',     NULL, NULL, NULL, 'litre',    9000,  1),
  ('Encre éco-solvant noir 1 L',                      'encre',     NULL, NULL, NULL, 'litre',    9000,  1),
  -- Encres : offset
  ('Encre offset cyan',                               'encre',     NULL, NULL, NULL, 'kg',       3500,  1),
  ('Encre offset magenta',                            'encre',     NULL, NULL, NULL, 'kg',       3500,  1),
  ('Encre offset jaune',                              'encre',     NULL, NULL, NULL, 'kg',       3500,  1),
  ('Encre offset noir',                               'encre',     NULL, NULL, NULL, 'kg',       3000,  1),
  -- Encres : sérigraphie
  ('Encre plastisol blanc',                           'encre',     NULL, NULL, NULL, 'kg',       5000,  1),
  ('Encre plastisol noir',                            'encre',     NULL, NULL, NULL, 'kg',       4500,  1),
  ('Encre sérigraphie à l’eau (couleur)',             'encre',     NULL, NULL, NULL, 'kg',       5000,  1),
  -- Consommables
  ('Plaque offset CTP',                               'consommable', NULL, 510,  400, 'piece',    800, 20),
  ('Écran sérigraphie (cadre alu + tissu)',           'consommable', NULL, NULL, NULL, 'piece',   3500,  2),
  ('Émulsion photosensible',                          'consommable', NULL, NULL, NULL, 'kg',      6000,  1),
  ('Solvant de nettoyage',                            'consommable', NULL, NULL, NULL, 'litre',   1500,  2),
  ('Film de pelliculage mat 320 mm × 200 m',          'consommable', NULL,  320, NULL, 'rouleau', 12000,  1),
  ('Film de pelliculage brillant 320 mm × 200 m',     'consommable', NULL,  320, NULL, 'rouleau', 12000,  1),
  ('Spirales de reliure (boîte de 100)',              'consommable', NULL, NULL, NULL, 'piece',   2500,  1),
  ('Œillets métal (boîte de 1 000)',                  'consommable', NULL, NULL, NULL, 'piece',   3000,  1)
) AS v(nom, categorie, grammage, largeur, hauteur, unite, prix, seuil)
WHERE NOT EXISTS (SELECT 1 FROM supports s WHERE lower(s.nom) = lower(v.nom));
