SET LOCAL search_path=pedpsy,pg_catalog;
-- 140: pseudonymous export with profile, consents, indicators and primary responses.
-- One row per active participant; latest valid attempt per release; no contact data.
CREATE OR REPLACE FUNCTION pedpsy.research_results_export(study uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE data jsonb;
BEGIN
  PERFORM pedpsy.lock_research_workbench(study);
  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'participant_id',b.participant_id,
      'profile',jsonb_build_object(
        'schema_version',prof.schema_version,'status',prof.status,
        'fields',coalesce(prof.fields,'[]'::jsonb),'values',coalesce(prof.answers,'{}'::jsonb)),
      'consents',coalesce(cons.consents,'[]'::jsonb)||coalesce(contact.consent,'[]'::jsonb),
      'results',coalesce(res.results,'[]'::jsonb)
    ) ORDER BY b.participant_id),'[]'::jsonb)
  INTO data
  FROM pedpsy.participant_group_bindings b
  JOIN pedpsy.participants p ON (p.study_id,p.id)=(b.study_id,b.participant_id) AND p.status='active'
  JOIN pedpsy.participant_contacts c ON (c.study_id,c.participant_id)=(b.study_id,b.participant_id) AND c.status='active'
  LEFT JOIN LATERAL (
    SELECT q.schema_version,q.status,q.fields,q.answers
    FROM (
      SELECT d.schema_version,d.status,d.fields,d.answers,1 AS priority
      FROM pedpsy.research_profile_drafts d
      WHERE d.study_id=b.study_id AND d.participant_id=b.participant_id
      UNION ALL
      SELECT pp.schema_version,pp.status,v.fields,pp.answers,2 AS priority
      FROM pedpsy.participant_passports pp
      JOIN pedpsy.passport_schema_versions v ON (v.study_id,v.schema_version)=(pp.study_id,pp.schema_version)
      WHERE pp.study_id=b.study_id AND pp.participant_id=b.participant_id
    ) q ORDER BY q.priority LIMIT 1
  ) prof ON true
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(jsonb_build_object(
      'purpose',a.purpose,'document_version',a.document_version,'accepted_at_ms',a.accepted_at_ms
    ) ORDER BY a.purpose) AS consents
    FROM (
      SELECT DISTINCT ON (purpose) purpose,document_version,accepted_at_ms
      FROM pedpsy.participant_consent_acceptances
      WHERE study_id=b.study_id AND participant_id=b.participant_id
      ORDER BY purpose,accepted_at_ms DESC
    ) a
  ) cons ON true
  LEFT JOIN LATERAL (
    SELECT jsonb_build_array(jsonb_build_object(
      'purpose','contact_processing','document_version',ca.notice_version,'accepted_at_ms',ca.confirmed_at_ms
    )) AS consent
    FROM pedpsy.participant_contact_acceptances ca
    JOIN pedpsy.participant_contacts pc ON (pc.study_id,pc.id)=(ca.study_id,ca.contact_id)
    WHERE pc.study_id=b.study_id AND pc.participant_id=b.participant_id AND pc.status='active'
    ORDER BY ca.confirmed_at_ms DESC LIMIT 1
  ) contact ON true
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(jsonb_build_object(
      'release_id',x.release_id,'method_id',r.method_id,
      'method_title',coalesce(c.title,r.method_id),
      'method_version_id',r.method_version_id,'attempt_id',x.attempt_id,
      'completed_at',x.completed_at,
      'measures',coalesce(ar.payload->'measures','[]'::jsonb),
      'classifications',coalesce(ar.payload->'classifications','[]'::jsonb),
      'responses',coalesce((
        SELECT jsonb_agg(jsonb_build_object('item_id',resp.item_id,'ordinal',ri.ordinal,'value',resp.value,'label',coalesce(item.text,'')) ORDER BY ri.ordinal)
        FROM pedpsy.responses resp
        JOIN pedpsy.release_items ri ON (ri.release_id,ri.item_id)=(resp.release_id,resp.item_id)
        LEFT JOIN LATERAL (SELECT value->>'text' AS text FROM jsonb_array_elements(r.form_snapshot->'items') value WHERE value->>'id'=resp.item_id LIMIT 1) item ON true
        WHERE resp.attempt_id=x.attempt_id
      ),'[]'::jsonb)
    ) ORDER BY coalesce(c.title,r.method_id),r.method_id) AS results
    FROM (
      SELECT DISTINCT ON (a.release_id) a.release_id,a.id AS attempt_id,a.completed_at
      FROM pedpsy.attempts a
      JOIN pedpsy.assignments z ON (z.study_id,z.id)=(a.study_id,a.assignment_id) AND z.status='active'
      JOIN pedpsy.stage_enrollments en ON (en.study_id,en.id)=(a.study_id,a.enrollment_id) AND en.status='active'
      JOIN pedpsy.participants p2 ON (p2.study_id,p2.id)=(en.study_id,en.participant_id) AND p2.status='active'
      JOIN pedpsy.participant_contacts c2 ON (c2.study_id,c2.participant_id)=(en.study_id,en.participant_id) AND c2.status='active'
      WHERE a.study_id=b.study_id AND b.participant_id=en.participant_id
        AND a.status='completed'
        AND NOT EXISTS(SELECT 1 FROM pedpsy.attempt_invalidations i WHERE i.attempt_id=a.id)
      ORDER BY a.release_id,a.completed_at DESC NULLS LAST,a.id
    ) x
    JOIN pedpsy.instrument_releases r ON r.id=x.release_id
    LEFT JOIN LATERAL (SELECT title FROM pedpsy.method_library_catalog WHERE release_id=r.id LIMIT 1) c ON true
    JOIN pedpsy.attempt_results ar ON ar.attempt_id=x.attempt_id
  ) res ON true
  WHERE b.study_id=study;
  PERFORM pedpsy.constructor_audit('studies.results.export',study);
  RETURN jsonb_build_object('study_id',study,'participants',data);
END $$;
REVOKE ALL ON FUNCTION pedpsy.research_results_export(uuid) FROM PUBLIC;
