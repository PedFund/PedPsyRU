SET LOCAL search_path=pedpsy,pg_catalog;
-- 114: the allowlist function grew into a long OR-chain and started exceeding the
-- 5-second statement timeout on stage admission. Allowed releases are materialized in
-- a small table; import scripts add new releases there. The check becomes one lookup.
CREATE TABLE IF NOT EXISTS release_allowlist(
  release_id uuid PRIMARY KEY REFERENCES instrument_releases(id),
  created_at_ms bigint NOT NULL CHECK(created_at_ms>=0)
);
INSERT INTO release_allowlist(release_id,created_at_ms)
SELECT r.id, floor(extract(epoch FROM clock_timestamp())*1000)::bigint
FROM instrument_releases r
WHERE pedpsy.constructor_release_allowed(r.id)
ON CONFLICT(release_id) DO NOTHING;
CREATE OR REPLACE FUNCTION constructor_release_allowed(release uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
  SELECT EXISTS(SELECT 1 FROM pedpsy.release_allowlist a
    JOIN pedpsy.instrument_releases r ON r.id=a.release_id
    WHERE a.release_id=release AND r.publication_state='draft')
$$;
REVOKE ALL ON FUNCTION constructor_release_allowed(uuid) FROM PUBLIC;
REVOKE ALL ON TABLE release_allowlist FROM PUBLIC;
