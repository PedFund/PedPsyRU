SET LOCAL search_path=pedpsy,pg_catalog;
-- 102: the first import wrote the service citation as the author. The catalogue row is
-- immutable, so the real adaptation authors go into the append-only overlay, exactly
-- like the earlier attribution correction. The import script now prefers release.authors.
INSERT INTO method_library_catalog_corrections(release_id,authors,indicators,reason,created_at_ms)
SELECT c.release_id, a.authors::jsonb, NULL, 'corrected_russian_adaptation_attribution',
  floor(extract(epoch FROM clock_timestamp())*1000)::bigint
FROM method_library_catalog c
JOIN (VALUES
  ('ffmq_39',  '["А.М. Голубев, Е.А. Дорошева"]'),
  ('shpana_20','["Е.Н. Осин"]'),
  ('ecv_15',   '["Панкратова А.А., Осин Е.Н."]'),
  ('darr_7',   '["Шмарина Т.А., Блинова Л.Д."]')
) AS a(method_id, authors) ON a.method_id=c.method_id
ON CONFLICT(release_id) DO NOTHING;
