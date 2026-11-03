SET LOCAL search_path=pedpsy,pg_catalog;
-- Separate legacy source records: an executable Excel key is not an approved
-- online release. No participant/release permissions are changed here.
CREATE TABLE legacy_method_sources(version text NOT NULL,path text NOT NULL,content bytea NOT NULL CHECK(octet_length(content) BETWEEN 1 AND 2097152),sha256 text NOT NULL CHECK(sha256=encode(sha256(content),'hex')),PRIMARY KEY(version,path));
CREATE TABLE legacy_method_versions(method_id text NOT NULL CHECK(method_id ~ '^[a-z][a-z0-9_]{0,95}$'),version text NOT NULL,document jsonb NOT NULL CHECK(jsonb_typeof(document)='object' AND octet_length(document::text)<=262144),sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),created_at_ms bigint NOT NULL,PRIMARY KEY(method_id,version),CHECK(document->>'method_id'=method_id));
CREATE TRIGGER legacy_method_source_immutable BEFORE UPDATE OR DELETE ON legacy_method_sources FOR EACH ROW EXECUTE FUNCTION immutable_row();
CREATE TRIGGER legacy_method_version_immutable BEFORE UPDATE OR DELETE ON legacy_method_versions FOR EACH ROW EXECUTE FUNCTION immutable_row();
ALTER TABLE legacy_method_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE legacy_method_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON legacy_method_sources,legacy_method_versions FROM PUBLIC;
CREATE FUNCTION read_method_planning_catalogue() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE allowed jsonb;data jsonb;
BEGIN
 -- Existing SQL guard locks current researcher/staff identity, checks expiry
 -- and records mandatory metadata-only audit before returning any data.
 allowed:=pedpsy.read_available_methods();
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'method_id',v.method_id,'version',v.version,'title',v.document->'title','authors',v.document->'authors',
  'item_count',v.document->'item_count','summary',v.document->'summary','indicators',v.document->'indicators','subscales',v.document->'subscales','outputs',v.document->'outputs',
  'legacy_scoring_ready',v.document->'legacy_scoring_ready','online_form_present',v.document->'online_form_present',
  'search_terms',v.document->'search_terms','blank_source',v.document->'blank_source',
  'releases',coalesce((SELECT jsonb_agg(x->'release_id') FROM jsonb_array_elements(allowed) x WHERE x->>'method_id'=v.method_id),'[]'::jsonb)
 ) ORDER BY v.document->>'title',v.method_id),'[]'::jsonb) INTO data
 FROM (SELECT DISTINCT ON(method_id) * FROM pedpsy.legacy_method_versions ORDER BY method_id,created_at_ms DESC,version DESC) v;
 IF jsonb_array_length(data)>100 OR octet_length(data::text)>524288 THEN RAISE EXCEPTION 'EXPORT_LIMIT' USING ERRCODE='54000';END IF;
 PERFORM pedpsy.record_account_check('account.read',true,'METHOD_PLANNING_METADATA');RETURN data;
END $$;
REVOKE ALL ON FUNCTION read_method_planning_catalogue() FROM PUBLIC;
