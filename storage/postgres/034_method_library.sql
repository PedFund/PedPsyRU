SET LOCAL search_path=pedpsy,pg_catalog;
-- Versioned private drafts, never publication/scientific approval. Existing
-- instrument_releases remain the sole authority for clinical assignments.
CREATE TABLE method_library_versions(
  method_id text NOT NULL CHECK(method_id ~ '^[a-z][a-z0-9_]{0,95}$'),package_version text NOT NULL CHECK(length(package_version)<=32 AND package_version ~ '^(0|[1-9][0-9]*)[.](0|[1-9][0-9]*)[.](0|[1-9][0-9]*)$'),
  revision integer NOT NULL CHECK(revision BETWEEN 1 AND 100),package_json text NOT NULL CHECK(octet_length(package_json)<=262144),
  package_digest text NOT NULL CHECK(package_digest ~ '^[a-f0-9]{64}$'),evidence jsonb NOT NULL,
  state text NOT NULL DEFAULT 'draft' CHECK(state='draft'),created_at_ms bigint NOT NULL,
  PRIMARY KEY(method_id,package_version),UNIQUE(method_id,revision),
  CHECK((package_json::jsonb)->>'method_id'=method_id AND (package_json::jsonb)->>'package_version'=package_version AND (package_json::jsonb)->'review'='{"technical":"unverified","scientific":"draft","publication":"draft"}'::jsonb)
);
CREATE TABLE method_library_artifacts(method_id text NOT NULL,package_version text NOT NULL,artifact_id text NOT NULL,path text NOT NULL,content bytea NOT NULL CHECK(octet_length(content) BETWEEN 1 AND 1048576),sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),PRIMARY KEY(method_id,package_version,artifact_id),UNIQUE(method_id,package_version,path),FOREIGN KEY(method_id,package_version) REFERENCES method_library_versions(method_id,package_version));
CREATE TABLE method_library_heads(method_id text PRIMARY KEY,package_version text NOT NULL,revision integer NOT NULL,FOREIGN KEY(method_id,package_version) REFERENCES method_library_versions(method_id,package_version));
CREATE TABLE method_library_catalog(release_id uuid PRIMARY KEY REFERENCES instrument_releases(id),method_id text NOT NULL,package_version text NOT NULL,title text NOT NULL CHECK(length(title) BETWEEN 1 AND 200),authors jsonb NOT NULL CHECK(jsonb_typeof(authors)='array' AND jsonb_array_length(authors) BETWEEN 1 AND 10),indicators jsonb NOT NULL CHECK(jsonb_typeof(indicators)='array' AND jsonb_array_length(indicators) BETWEEN 1 AND 100),search_terms jsonb NOT NULL CHECK(jsonb_typeof(search_terms)='array' AND jsonb_array_length(search_terms)<=50),FOREIGN KEY(method_id,package_version) REFERENCES method_library_versions(method_id,package_version));
CREATE TRIGGER method_library_version_immutable BEFORE UPDATE OR DELETE ON method_library_versions FOR EACH ROW EXECUTE FUNCTION immutable_row();
CREATE TRIGGER method_library_artifact_immutable BEFORE UPDATE OR DELETE ON method_library_artifacts FOR EACH ROW EXECUTE FUNCTION immutable_row();
CREATE TRIGGER method_library_catalog_immutable BEFORE UPDATE OR DELETE ON method_library_catalog FOR EACH ROW EXECUTE FUNCTION immutable_row();
CREATE FUNCTION method_library_record(target_method text,target_version text) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
 SELECT jsonb_build_object('method_id',method_id,'package_version',package_version,'revision',revision,'package_digest',package_digest,'handler_state',evidence->'handler'->>'state','blockers',evidence->'blockers','state',state) FROM pedpsy.method_library_versions WHERE method_id=target_method AND package_version=target_version
$$;
CREATE FUNCTION lock_method_library() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE a record;at_ms bigint;
BEGIN
 PERFORM pg_advisory_xact_lock(5151980034);PERFORM pedpsy.lock_staff_identity();SELECT * INTO a FROM pedpsy.account_actor();at_ms:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
 IF a.credential_id IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='28000';END IF;
 IF a.actor_role<>'superadministrator' THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';END IF;
 IF at_ms>=a.expires_at_ms THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='28000';END IF;
 IF a.mfa_verified_at_ms IS NULL OR a.mfa_verified_at_ms>at_ms OR at_ms-a.mfa_verified_at_ms>=300000 THEN RAISE EXCEPTION 'MFA_RECHECK_REQUIRED' USING ERRCODE='42501';END IF;
END $$;
-- Internal append helper is available only to the trusted schema owner. The
-- runtime wrapper below independently requires current superadmin + fresh MFA.
CREATE FUNCTION append_method_library_draft(expected integer,raw_package text,digest text,proof jsonb,blobs jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE pkg jsonb;mid text;ver text;head record;stored record;a jsonb;b jsonb;bytes bytea;total integer:=0;n integer:=0;new_revision integer;
BEGIN
 PERFORM pg_advisory_xact_lock(5151980034);
 IF expected IS NULL OR expected NOT BETWEEN 0 AND 99 OR raw_package IS NULL OR octet_length(raw_package)>262144 OR digest IS NULL OR digest !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'INVALID_METHOD_PACKAGE' USING ERRCODE='22023';END IF;
 pkg:=raw_package::jsonb;mid:=pkg->>'method_id';ver:=pkg->>'package_version';
 IF jsonb_typeof(pkg)<>'object' OR pkg->>'schema_version' IS DISTINCT FROM '1.0' OR mid IS NULL OR mid !~ '^[a-z][a-z0-9_]{0,95}$' OR ver IS NULL OR length(ver)>32 OR ver !~ '^(0|[1-9][0-9]*)[.](0|[1-9][0-9]*)[.](0|[1-9][0-9]*)$'
  OR pkg->'review' IS DISTINCT FROM '{"technical":"unverified","scientific":"draft","publication":"draft"}'::jsonb OR jsonb_typeof(pkg->'artifacts') IS DISTINCT FROM 'array' OR jsonb_typeof(blobs) IS DISTINCT FROM 'array' OR jsonb_typeof(proof->'blockers') IS DISTINCT FROM 'array' OR proof->'handler'->>'state' IS NULL OR proof->'handler'->>'state' NOT IN ('pinned','unsupported') THEN RAISE EXCEPTION 'INVALID_METHOD_PACKAGE' USING ERRCODE='22023';END IF;
 IF octet_length(proof::text)>65536 OR jsonb_array_length(proof->'blockers')>64 OR EXISTS(SELECT 1 FROM jsonb_array_elements(proof->'blockers') x WHERE jsonb_typeof(x)<>'string' OR length(x#>>'{}')>200) THEN RAISE EXCEPTION 'INVALID_METHOD_PACKAGE' USING ERRCODE='22023';END IF;
 IF octet_length(blobs::text)>12000000 THEN RAISE EXCEPTION 'DESIGN_LIMIT' USING ERRCODE='54000';END IF;
 IF jsonb_array_length(blobs)>32 OR jsonb_array_length(blobs)<>jsonb_array_length(pkg->'artifacts') THEN RAISE EXCEPTION 'METHOD_ARTIFACT_MISMATCH' USING ERRCODE='22023';END IF;
 FOR a IN SELECT value FROM jsonb_array_elements(pkg->'artifacts') LOOP
   IF (SELECT count(*) FROM jsonb_array_elements(blobs) x WHERE x->>'id'=a->>'id' AND x->>'path'=a->>'path')<>1 THEN RAISE EXCEPTION 'METHOD_ARTIFACT_MISMATCH' USING ERRCODE='22023';END IF;
   SELECT value INTO b FROM jsonb_array_elements(blobs) WHERE value->>'id'=a->>'id' AND value->>'path'=a->>'path';IF length(b->>'base64')>1398208 THEN RAISE EXCEPTION 'METHOD_ARTIFACT_MISMATCH' USING ERRCODE='22023';END IF;bytes:=decode(b->>'base64','base64');
   IF bytes IS NULL OR octet_length(bytes) NOT BETWEEN 1 AND 1048576 OR octet_length(bytes) IS DISTINCT FROM (a->>'bytes')::integer OR encode(sha256(bytes),'hex') IS DISTINCT FROM a->>'sha256' THEN RAISE EXCEPTION 'METHOD_ARTIFACT_MISMATCH' USING ERRCODE='22023';END IF;
   PERFORM convert_from(bytes,'UTF8');total:=total+octet_length(bytes);n:=n+1;
 END LOOP;
 IF total>8388608 THEN RAISE EXCEPTION 'DESIGN_LIMIT' USING ERRCODE='54000';END IF;
 SELECT * INTO stored FROM pedpsy.method_library_versions WHERE method_id=mid AND package_version=ver;
 IF FOUND THEN
   IF stored.package_digest<>digest OR stored.package_json::jsonb<>pkg THEN RAISE EXCEPTION 'METHOD_VERSION_CONFLICT' USING ERRCODE='P0001';END IF;
   RETURN pedpsy.method_library_record(mid,ver);
 END IF;
 SELECT * INTO head FROM pedpsy.method_library_heads WHERE method_id=mid FOR UPDATE;
 IF coalesce(head.revision,0)<>expected THEN RAISE EXCEPTION 'METHOD_LIBRARY_CONFLICT' USING ERRCODE='P0001';END IF;
 IF (SELECT count(*) FROM pedpsy.method_library_versions)>=500 OR (NOT FOUND AND (SELECT count(*) FROM pedpsy.method_library_heads)>=200) THEN RAISE EXCEPTION 'DESIGN_LIMIT' USING ERRCODE='54000';END IF;
 new_revision:=expected+1;
 INSERT INTO pedpsy.method_library_versions(method_id,package_version,revision,package_json,package_digest,evidence,created_at_ms) VALUES(mid,ver,new_revision,raw_package,digest,proof,floor(extract(epoch FROM clock_timestamp())*1000)::bigint);
 FOR a IN SELECT value FROM jsonb_array_elements(pkg->'artifacts') LOOP
   SELECT value INTO b FROM jsonb_array_elements(blobs) WHERE value->>'id'=a->>'id';INSERT INTO pedpsy.method_library_artifacts VALUES(mid,ver,a->>'id',a->>'path',decode(b->>'base64','base64'),a->>'sha256');
 END LOOP;
 INSERT INTO pedpsy.method_library_heads VALUES(mid,ver,new_revision) ON CONFLICT(method_id) DO UPDATE SET package_version=excluded.package_version,revision=excluded.revision;
 RETURN pedpsy.method_library_record(mid,ver);
END $$;
CREATE FUNCTION save_method_library_draft(expected integer,raw_package text,digest text,proof jsonb,blobs jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE data jsonb;
BEGIN PERFORM pedpsy.lock_method_library();data:=pedpsy.append_method_library_draft(expected,raw_package,digest,proof,blobs);PERFORM pedpsy.lock_method_library();PERFORM pedpsy.record_account_check('methods.manage',true,'DRAFT_ONLY');PERFORM pedpsy.touch_staff_identity();RETURN data;END $$;
CREATE FUNCTION list_method_library() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE data jsonb;
BEGIN PERFORM pedpsy.lock_method_library();SELECT coalesce(jsonb_agg(pedpsy.method_library_record(method_id,package_version) ORDER BY method_id,revision),'[]'::jsonb) INTO data FROM pedpsy.method_library_versions;IF octet_length(data::text)>1048576 THEN RAISE EXCEPTION 'EXPORT_LIMIT' USING ERRCODE='54000';END IF;PERFORM pedpsy.record_account_check('methods.manage',true,'DRAFT_LIST');PERFORM pedpsy.touch_staff_identity();RETURN data;END $$;
CREATE FUNCTION read_method_library(mid text,ver text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE data jsonb;
BEGIN PERFORM pedpsy.lock_method_library();SELECT jsonb_build_object('record',pedpsy.method_library_record(mid,ver),'package_json',package_json) INTO data FROM pedpsy.method_library_versions WHERE method_id=mid AND package_version=ver;IF NOT FOUND THEN RAISE EXCEPTION 'NOT_AVAILABLE' USING ERRCODE='P0002';END IF;PERFORM pedpsy.record_account_check('methods.manage',true,'DRAFT_READ');PERFORM pedpsy.touch_staff_identity();RETURN data;END $$;
CREATE FUNCTION read_available_methods() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE a record;data jsonb;
BEGIN
 SELECT * INTO a FROM pedpsy.account_actor();IF a.actor_role='researcher' THEN PERFORM pedpsy.lock_researcher_identity();ELSIF a.actor_role IN ('administrator','superadministrator') THEN PERFORM pedpsy.lock_staff_identity();ELSE RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='28000';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('release_id',c.release_id,'method_id',c.method_id,'title',c.title,'authors',c.authors,'indicators',c.indicators,'search_terms',c.search_terms) ORDER BY c.title,c.release_id),'[]'::jsonb) INTO data
 FROM pedpsy.method_library_catalog c JOIN pedpsy.instrument_releases r ON r.id=c.release_id AND r.method_id=c.method_id JOIN pedpsy.method_library_versions v ON v.method_id=c.method_id AND v.package_version=c.package_version WHERE pedpsy.constructor_release_allowed(r.id) AND v.evidence->'handler'->>'state'='pinned' AND v.evidence->'handler'->>'method_version_id'=r.method_version_id AND v.evidence->'handler'->>'handler_version'=r.handler_version;
 IF jsonb_array_length(data)>100 OR octet_length(data::text)>262144 THEN RAISE EXCEPTION 'EXPORT_LIMIT' USING ERRCODE='54000';END IF;
 PERFORM pedpsy.record_account_check('account.read',true,'AVAILABLE_METHOD_METADATA');IF a.actor_role='researcher' THEN UPDATE pedpsy.researcher_sessions SET last_seen_at_ms=floor(extract(epoch FROM clock_timestamp())*1000)::bigint WHERE token_hash=current_setting('app.session_hash',true);ELSE PERFORM pedpsy.touch_staff_identity();END IF;RETURN data;
END $$;
ALTER TABLE method_library_versions ENABLE ROW LEVEL SECURITY;ALTER TABLE method_library_artifacts ENABLE ROW LEVEL SECURITY;ALTER TABLE method_library_heads ENABLE ROW LEVEL SECURITY;ALTER TABLE method_library_catalog ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON method_library_versions,method_library_artifacts,method_library_heads,method_library_catalog FROM PUBLIC;
REVOKE ALL ON FUNCTION method_library_record(text,text),lock_method_library(),append_method_library_draft(integer,text,text,jsonb,jsonb),save_method_library_draft(integer,text,text,jsonb,jsonb),list_method_library(),read_method_library(text,text),read_available_methods() FROM PUBLIC;
