SET LOCAL search_path=pedpsy,pg_catalog;
-- 150: seed the authoring label correction from the already-public catalogue.
-- The runtime role must not SELECT method_library_catalog directly; the
-- correction is owner-written and is read by the existing form path.
INSERT INTO pedpsy.release_presentation_corrections(id,release_id,indicators,reason,created_at_ms)
SELECT gen_random_uuid(),r.id,c.indicators,'authoring_label_bootstrap',
       floor(extract(epoch FROM clock_timestamp())*1000)::bigint
FROM pedpsy.instrument_releases r
JOIN pedpsy.method_library_catalog c ON c.release_id=r.id
WHERE r.handler_version='authoring-numeric-1.0.0'
  AND c.indicators IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM pedpsy.release_presentation_corrections p
    WHERE p.release_id=r.id AND p.indicators IS NOT NULL
  );
