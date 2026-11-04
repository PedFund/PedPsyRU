SET LOCAL search_path=pedpsy,pg_catalog;
-- 062: presentational corrections for an already pinned release.
-- The release row, its items and the catalogue are immutable. An owner may still need to
-- show a method instruction or a corrected title that was not part of the pinned form, so
-- corrections live in their own append-only table and never rewrite the release.
CREATE TABLE release_presentation_corrections(
  id uuid PRIMARY KEY,
  release_id uuid NOT NULL REFERENCES instrument_releases(id),
  title text,
  instruction text,
  indicators jsonb,
  reason text NOT NULL,
  created_at_ms bigint NOT NULL,
  CONSTRAINT release_presentation_payload CHECK (title IS NOT NULL OR instruction IS NOT NULL OR indicators IS NOT NULL),
  CONSTRAINT release_presentation_title CHECK (title IS NULL OR length(btrim(title)) BETWEEN 1 AND 200),
  CONSTRAINT release_presentation_instruction CHECK (instruction IS NULL OR length(btrim(instruction)) BETWEEN 1 AND 4000),
  CONSTRAINT release_presentation_indicators CHECK (indicators IS NULL OR (jsonb_typeof(indicators)='array' AND jsonb_array_length(indicators) BETWEEN 1 AND 40)),
  CONSTRAINT release_presentation_reason CHECK (length(btrim(reason)) BETWEEN 1 AND 200)
);
CREATE INDEX release_presentation_corrections_time ON release_presentation_corrections(release_id, created_at_ms DESC);
CREATE TRIGGER release_presentation_corrections_immutable BEFORE UPDATE OR DELETE ON release_presentation_corrections
  FOR EACH ROW EXECUTE FUNCTION immutable_row();
REVOKE ALL ON release_presentation_corrections FROM PUBLIC;
