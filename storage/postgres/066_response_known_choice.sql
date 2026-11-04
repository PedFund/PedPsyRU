SET LOCAL search_path=pedpsy,pg_catalog;
-- 066: a stored answer may be any labelled numeric rank of a ranking method, not only
-- the seven values pinned for the first instruments. Additive: the A/B pair stays and the
-- numeric range grows to 1..20, matching release_item_pinned_choices.
ALTER TABLE responses DROP CONSTRAINT IF EXISTS response_known_choice;
ALTER TABLE responses ADD CONSTRAINT response_known_choice CHECK (
  value IN ('A','B') OR value IN (
    '1','2','3','4','5','6','7','8','9','10','11','12','13','14','15','16','17','18','19','20'
  )
);
