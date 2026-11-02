SET LOCAL search_path=pedpsy,pg_catalog;
-- Corrections are append-only overlays: an imported immutable package and its
-- original catalogue record are never rewritten after a metadata error.
CREATE TABLE method_library_catalog_corrections(
  release_id uuid PRIMARY KEY REFERENCES method_library_catalog(release_id),
  authors jsonb NOT NULL CHECK(jsonb_typeof(authors)='array' AND jsonb_array_length(authors) BETWEEN 1 AND 10),
  reason text NOT NULL CHECK(reason='corrected_russian_adaptation_attribution'),
  created_at_ms bigint NOT NULL
);
CREATE TRIGGER method_library_catalog_correction_immutable BEFORE UPDATE OR DELETE ON method_library_catalog_corrections FOR EACH ROW EXECUTE FUNCTION immutable_row();
CREATE OR REPLACE FUNCTION read_available_methods() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE a record;data jsonb;
BEGIN
 SELECT * INTO a FROM pedpsy.account_actor();IF a.actor_role='researcher' THEN PERFORM pedpsy.lock_researcher_identity();ELSIF a.actor_role IN ('administrator','superadministrator') THEN PERFORM pedpsy.lock_staff_identity();ELSE RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='28000';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('release_id',c.release_id,'method_id',c.method_id,'title',c.title,'authors',coalesce(f.authors,c.authors),'indicators',c.indicators,'search_terms',c.search_terms) ORDER BY c.title,c.release_id),'[]'::jsonb) INTO data
 FROM pedpsy.method_library_catalog c JOIN pedpsy.instrument_releases r ON r.id=c.release_id AND r.method_id=c.method_id JOIN pedpsy.method_library_versions v ON v.method_id=c.method_id AND v.package_version=c.package_version LEFT JOIN pedpsy.method_library_catalog_corrections f ON f.release_id=c.release_id WHERE pedpsy.constructor_release_allowed(r.id) AND v.evidence->'handler'->>'state'='pinned' AND v.evidence->'handler'->>'method_version_id'=r.method_version_id AND v.evidence->'handler'->>'handler_version'=r.handler_version;
 IF jsonb_array_length(data)>100 OR octet_length(data::text)>262144 THEN RAISE EXCEPTION 'EXPORT_LIMIT' USING ERRCODE='54000';END IF;
 PERFORM pedpsy.record_account_check('account.read',true,'AVAILABLE_METHOD_METADATA');IF a.actor_role='researcher' THEN UPDATE pedpsy.researcher_sessions SET last_seen_at_ms=floor(extract(epoch FROM clock_timestamp())*1000)::bigint WHERE token_hash=current_setting('app.session_hash',true);ELSE PERFORM pedpsy.touch_staff_identity();END IF;RETURN data;
END $$;
ALTER TABLE method_library_catalog_corrections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON method_library_catalog_corrections FROM PUBLIC;
REVOKE ALL ON FUNCTION read_available_methods() FROM PUBLIC;
