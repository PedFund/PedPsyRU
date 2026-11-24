SET LOCAL search_path=pedpsy,pg_catalog;
-- 141: send the real participant reminder text; worker delivers it over SMTP.
CREATE OR REPLACE FUNCTION pedpsy.change_research_workbench_v2(study uuid,expected integer,action text,input jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
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
  INSERT INTO pedpsy.research_reminder_outbox SELECT study,request,(x->>'participant_id')::uuid,(x->>'stage_id')::uuid,c.email_key,'Напоминаем, что вы зарегистрированы как участник исследования и ещё не завершили прохождение этапа. Пожалуйста, не забудьте пройти его. Если вы уже завершили этап, повторное заполнение не требуется.',at_ms
    FROM jsonb_array_elements(rows) x
    JOIN pedpsy.participant_contacts c ON (c.study_id,c.participant_id)=(study,(x->>'participant_id')::uuid)
    WHERE (x->>'group_id')::uuid=target AND (x->>'stage_id')::uuid=(input->>'stage_id')::uuid AND x->>'status'<>'completed'
    AND NOT EXISTS(SELECT 1 FROM pedpsy.research_reminder_outbox o WHERE o.study_id=study AND o.participant_id=(x->>'participant_id')::uuid AND o.stage_id=(x->>'stage_id')::uuid AND o.created_at_ms>at_ms-86400000);
  PERFORM pedpsy.constructor_audit('studies.reminders.synthetic',study);RETURN jsonb_build_object('queued',n,'mode','synthetic');
END $$;

REVOKE ALL ON FUNCTION pedpsy.change_research_workbench_v2(uuid,integer,text,jsonb) FROM PUBLIC;
