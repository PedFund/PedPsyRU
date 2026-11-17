SET LOCAL search_path=pedpsy,pg_catalog;
-- 090: the researcher progress projection stops carrying participant email
-- addresses. Applied migrations keep their definitions; this adds an internal
-- v2 helper and re-points the public function at it. Row membership, statuses
-- and the export limit are unchanged: the contact join stays because it admits
-- only active contacts of the synthetic @example.test contour.
CREATE FUNCTION research_progress_rows_v2(study uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE data jsonb;count_rows integer;
BEGIN
  SELECT count(*)::integer,coalesce(jsonb_agg(jsonb_build_object('participant_id',q.participant_id,'group_id',q.group_id,'stage_id',q.stage_id,'status',q.status) ORDER BY q.group_id,q.stage_id,q.participant_id),'[]'::jsonb) INTO count_rows,data
  FROM (SELECT b.participant_id,b.group_id,t.id stage_id,
    CASE WHEN x.total>0 AND x.finished=x.total THEN 'completed' WHEN x.started>0 THEN 'in_progress' ELSE 'not_started' END status
    FROM pedpsy.participant_group_bindings b JOIN pedpsy.participants p ON (p.study_id,p.id)=(b.study_id,b.participant_id) AND p.status='active'
    JOIN pedpsy.research_groups g ON (g.study_id,g.id)=(b.study_id,b.group_id) AND g.status='active'
    JOIN pedpsy.participant_contacts c ON (c.study_id,c.participant_id)=(b.study_id,b.participant_id) AND c.status='active'
    JOIN pedpsy.research_stages t ON t.study_id=b.study_id AND t.status='active'
    CROSS JOIN LATERAL (SELECT count(*) total,count(*) FILTER(WHERE a.status='completed') finished,count(*) FILTER(WHERE a.status='completed' OR EXISTS(SELECT 1 FROM pedpsy.responses r WHERE r.study_id=a.study_id AND r.attempt_id=a.id)) started
      FROM pedpsy.assignments z LEFT JOIN pedpsy.attempts a ON a.study_id=z.study_id AND a.assignment_id=z.id AND a.enrollment_id IN (SELECT en.id FROM pedpsy.stage_enrollments en WHERE en.study_id=b.study_id AND en.participant_id=b.participant_id)
      LEFT JOIN pedpsy.stage_enrollments e ON (e.study_id,e.id)=(a.study_id,a.enrollment_id)
      WHERE z.study_id=b.study_id AND z.group_id=b.group_id AND z.stage_id=t.id AND z.status='active' AND (e.id IS NULL OR e.status='active')) x
    WHERE b.study_id=study AND c.email_key ~ '@example[.]test$' ORDER BY b.participant_id,t.id LIMIT 501) q;
  IF count_rows>500 OR octet_length(data::text)>1048576 THEN RAISE EXCEPTION 'EXPORT_LIMIT' USING ERRCODE='54000';END IF;
  RETURN data;
END $$;
CREATE OR REPLACE FUNCTION research_progress_rows(study uuid) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
 SELECT coalesce(jsonb_agg(x),'[]'::jsonb) FROM jsonb_array_elements(pedpsy.research_progress_rows_v2(study)) x
 WHERE NOT EXISTS(SELECT 1 FROM pedpsy.stage_enrollments e WHERE e.study_id=study AND e.participant_id=(x->>'participant_id')::uuid AND e.stage_id=(x->>'stage_id')::uuid AND e.status<>'active')
$$;
-- Reminders used to copy the recipient address out of the progress projection.
-- Keep the same availability, idempotency, cooldown and throttling contract, but
-- resolve the contact of record here so the public projection stays address-free.
-- The contact identity is unique per participant, so no row is duplicated.
CREATE OR REPLACE FUNCTION change_research_workbench_v2(study uuid,expected integer,action text,input jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE at_ms bigint;target uuid;request uuid;rows jsonb;n integer:=0;actor record;
BEGIN
  IF expected IS NULL OR expected<0 THEN RAISE EXCEPTION 'INVALID_STUDY_INPUT' USING ERRCODE='22023';END IF;
  PERFORM pedpsy.lock_research_workbench(study,expected);
  IF action<>'remind' THEN RETURN pedpsy.change_research_workbench_v1(study,expected,action,input);END IF;
  IF NOT EXISTS(SELECT 1 FROM pedpsy.group_stage_access WHERE study_id=study AND group_id=(input->>'group_id')::uuid AND stage_id=(input->>'stage_id')::uuid) THEN RAISE EXCEPTION 'NOT_AVAILABLE' USING ERRCODE='P0002';END IF;
  IF (SELECT status FROM pedpsy.studies WHERE id=study)<>'active' THEN RAISE EXCEPTION 'DESIGN_FROZEN' USING ERRCODE='P0001';END IF;
  target:=(input->>'group_id')::uuid;request:=(input->>'request_id')::uuid;
  IF NOT EXISTS(SELECT 1 FROM pedpsy.research_groups WHERE study_id=study AND id=target AND status='active') OR NOT EXISTS(SELECT 1 FROM pedpsy.research_stages WHERE study_id=study AND id=(input->>'stage_id')::uuid AND status='active') THEN RAISE EXCEPTION 'NOT_AVAILABLE' USING ERRCODE='P0002';END IF;
  IF EXISTS(SELECT 1 FROM pedpsy.research_reminder_batches WHERE study_id=study AND request_id=request AND (group_id<>target OR stage_id<>(input->>'stage_id')::uuid)) THEN RAISE EXCEPTION 'INVALID_STUDY_INPUT' USING ERRCODE='22023';END IF;
  IF EXISTS(SELECT 1 FROM pedpsy.research_reminder_batches WHERE study_id=study AND request_id=request) THEN RETURN jsonb_build_object('queued',(SELECT queued FROM pedpsy.research_reminder_batches WHERE study_id=study AND request_id=request),'mode','synthetic');END IF;
  at_ms:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
  IF (SELECT count(*) FROM pedpsy.research_reminder_batches WHERE study_id=study AND created_at_ms>at_ms-3600000)>=10 THEN RAISE EXCEPTION 'INVITE_THROTTLED' USING ERRCODE='54000';END IF;
  PERFORM 1 FROM pedpsy.participant_credentials WHERE study_id=study ORDER BY id FOR UPDATE;
  rows:=pedpsy.research_progress_rows(study);SELECT * INTO actor FROM pedpsy.account_actor();
  SELECT count(*)::integer INTO n FROM jsonb_array_elements(rows) x WHERE (x->>'group_id')::uuid=target AND (x->>'stage_id')::uuid=(input->>'stage_id')::uuid AND x->>'status'<>'completed'
    AND NOT EXISTS(SELECT 1 FROM pedpsy.research_reminder_outbox o WHERE o.study_id=study AND o.participant_id=(x->>'participant_id')::uuid AND o.stage_id=(x->>'stage_id')::uuid AND o.created_at_ms>at_ms-86400000);
  INSERT INTO pedpsy.research_reminder_batches VALUES(study,request,target,(input->>'stage_id')::uuid,actor.credential_id,at_ms,n);
  INSERT INTO pedpsy.research_reminder_outbox SELECT study,request,(x->>'participant_id')::uuid,(x->>'stage_id')::uuid,c.email_key,'Пожалуйста, завершите прохождение этапа исследования. Если вы уже завершили его, повторное заполнение не требуется.',at_ms
    FROM jsonb_array_elements(rows) x
    JOIN pedpsy.participant_contacts c ON (c.study_id,c.participant_id)=(study,(x->>'participant_id')::uuid)
    WHERE (x->>'group_id')::uuid=target AND (x->>'stage_id')::uuid=(input->>'stage_id')::uuid AND x->>'status'<>'completed'
    AND NOT EXISTS(SELECT 1 FROM pedpsy.research_reminder_outbox o WHERE o.study_id=study AND o.participant_id=(x->>'participant_id')::uuid AND o.stage_id=(x->>'stage_id')::uuid AND o.created_at_ms>at_ms-86400000);
  PERFORM pedpsy.constructor_audit('studies.reminders.synthetic',study);RETURN jsonb_build_object('queued',n,'mode','synthetic');
END $$;
REVOKE ALL ON FUNCTION research_progress_rows_v2(uuid) FROM PUBLIC;
