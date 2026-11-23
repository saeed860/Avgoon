-- Roll back the Caterpillar part-reference feature mistakenly added to Avgoon.
-- The catalog is not part of Avgoon's dry-construction product domain.
DROP TABLE IF EXISTS PartReference;
