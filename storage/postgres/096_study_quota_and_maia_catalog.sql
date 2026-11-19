SET LOCAL search_path=pedpsy,pg_catalog;
-- 096: the owner raised the active-study quota to five (the limit itself is removed later
-- by 097) and corrected the MAIA-R catalogue metadata. The catalogue row is immutable, so
-- the correction goes into the append-only overlay table, exactly like the existing
-- author-attribution corrections; the overlay now carries indicators as well.
ALTER TABLE researcher_credentials ALTER COLUMN active_study_quota SET DEFAULT 5;
UPDATE researcher_credentials SET active_study_quota=5 WHERE active_study_quota<5;
ALTER TABLE method_library_catalog_corrections ADD COLUMN indicators jsonb
  CHECK(indicators IS NULL OR (jsonb_typeof(indicators)='array' AND jsonb_array_length(indicators) BETWEEN 1 AND 100));
INSERT INTO method_library_catalog_corrections(release_id,authors,indicators,reason,created_at_ms)
SELECT c.release_id,
  jsonb_build_array('Попова Резеда Равилевна, Лопухова Ольга Геннадьевна'),
  '["Наблюдение","Не отвлечение внимания от боли","Отсутствие беспокойства","Регуляция внимания","Осознавание негативного эмоционального состояния","Осознавание позитивного эмоционального состояния","Саморегуляция на основе активного «слушания» тела","Доверие"]'::jsonb,
  'corrected_russian_adaptation_attribution',floor(extract(epoch FROM clock_timestamp())*1000)::bigint
FROM method_library_catalog c WHERE c.method_id='maia_r_32'
ON CONFLICT(release_id) DO NOTHING;
-- The overlay carries indicators too, so the read function prefers them when present.
CREATE OR REPLACE FUNCTION read_available_methods() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE a record;data jsonb;
BEGIN
 SELECT * INTO a FROM pedpsy.account_actor();IF a.actor_role='researcher' THEN PERFORM pedpsy.lock_researcher_identity();ELSIF a.actor_role IN ('administrator','superadministrator') THEN PERFORM pedpsy.lock_staff_identity();ELSE RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='28000';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('release_id',c.release_id,'method_id',c.method_id,'title',c.title,'authors',coalesce(f.authors,c.authors),'indicators',coalesce(f.indicators,c.indicators),'search_terms',c.search_terms) ORDER BY c.title,c.release_id),'[]'::jsonb) INTO data
 FROM pedpsy.method_library_catalog c JOIN pedpsy.instrument_releases r ON r.id=c.release_id AND r.method_id=c.method_id JOIN pedpsy.method_library_versions v ON v.method_id=c.method_id AND v.package_version=c.package_version LEFT JOIN pedpsy.method_library_catalog_corrections f ON f.release_id=c.release_id WHERE pedpsy.constructor_release_allowed(r.id) AND v.evidence->'handler'->>'state'='pinned' AND v.evidence->'handler'->>'method_version_id'=r.method_version_id AND v.evidence->'handler'->>'handler_version'=r.handler_version;
 IF jsonb_array_length(data)>100 OR octet_length(data::text)>262144 THEN RAISE EXCEPTION 'EXPORT_LIMIT' USING ERRCODE='54000';END IF;
 PERFORM pedpsy.record_account_check('account.read',true,'AVAILABLE_METHOD_METADATA');IF a.actor_role='researcher' THEN UPDATE pedpsy.researcher_sessions SET last_seen_at_ms=floor(extract(epoch FROM clock_timestamp())*1000)::bigint WHERE token_hash=current_setting('app.session_hash',true);ELSE PERFORM pedpsy.touch_staff_identity();END IF;RETURN data;
END $$;
REVOKE ALL ON FUNCTION read_available_methods() FROM PUBLIC;
