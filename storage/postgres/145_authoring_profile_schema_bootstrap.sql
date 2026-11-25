SET LOCAL search_path=pedpsy,pg_catalog;
-- 145: a new study must always have a participant profile schema. Older drafts
-- could be created without one, which surfaced as the misleading "add a group".
INSERT INTO pedpsy.passport_schema_versions(study_id,schema_version,fields)
SELECT s.id,1,pedpsy.passport_basic_fields(false)
FROM pedpsy.studies s
WHERE NOT EXISTS(SELECT 1 FROM pedpsy.passport_schema_versions v WHERE v.study_id=s.id AND v.schema_version=1)
ON CONFLICT(study_id,schema_version) DO NOTHING;
INSERT INTO pedpsy.study_passport_schemas(study_id,schema_version)
SELECT s.id,1 FROM pedpsy.studies s
WHERE NOT EXISTS(SELECT 1 FROM pedpsy.study_passport_schemas p WHERE p.study_id=s.id)
AND EXISTS(SELECT 1 FROM pedpsy.passport_schema_versions v WHERE v.study_id=s.id AND v.schema_version=1)
ON CONFLICT(study_id) DO NOTHING;
INSERT INTO pedpsy.research_profile_schemas(study_id,version,fields)
SELECT s.id,1,coalesce((SELECT v.fields FROM pedpsy.passport_schema_versions v WHERE v.study_id=s.id AND v.schema_version=1),pedpsy.passport_basic_fields(false))
FROM pedpsy.studies s
WHERE NOT EXISTS(SELECT 1 FROM pedpsy.research_profile_schemas r WHERE r.study_id=s.id)
ON CONFLICT(study_id,version) DO NOTHING;
INSERT INTO pedpsy.research_profile_defaults(study_id,version)
SELECT s.id,1 FROM pedpsy.studies s
WHERE NOT EXISTS(SELECT 1 FROM pedpsy.research_profile_defaults d WHERE d.study_id=s.id)
AND EXISTS(SELECT 1 FROM pedpsy.research_profile_schemas r WHERE r.study_id=s.id AND r.version=1)
ON CONFLICT(study_id) DO NOTHING;
