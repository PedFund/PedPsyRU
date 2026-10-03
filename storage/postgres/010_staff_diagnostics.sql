SET LOCAL search_path=pedpsy,pg_catalog;
CREATE FUNCTION staff_protocol_summary() RETURNS TABLE(attempt_id uuid,study_id uuid,study_title text,participant_code text,status text,has_result boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
BEGIN
  PERFORM pedpsy.lock_staff_operation('protocols.read');
  IF (SELECT count(*) FROM pedpsy.attempts)>500 THEN RAISE EXCEPTION 'EXPORT_LIMIT' USING ERRCODE='54000';END IF;
  PERFORM pedpsy.record_account_check('protocols.read',true,'GLOBAL_DIRECTORY');PERFORM pedpsy.touch_staff_identity();
  RETURN QUERY SELECT a.id,a.study_id,s.title,p.display_code,a.status,a.completion_result_id IS NOT NULL FROM pedpsy.attempts a
    JOIN pedpsy.studies s ON s.id=a.study_id JOIN pedpsy.stage_enrollments e ON (e.study_id,e.id)=(a.study_id,a.enrollment_id)
    JOIN pedpsy.participants p ON (p.study_id,p.id)=(e.study_id,e.participant_id) ORDER BY a.study_id,a.id;
END $$;
CREATE FUNCTION staff_diagnostic_snapshot(attempt uuid,exported boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE a record;operation text;data jsonb;records jsonb;n integer;
BEGIN
  operation:=CASE WHEN exported THEN 'protocols.download' ELSE 'protocols.read' END;
  SELECT * INTO a FROM pedpsy.lock_staff_operation(operation);
  -- One SQL statement creates the entire diagnostic snapshot: no mixed revisions
  -- from sequential response/result queries under READ COMMITTED.
  SELECT coalesce(jsonb_agg(q.record ORDER BY q.study,q.id),'[]'::jsonb) INTO records FROM (
    SELECT t.study_id AS study,t.id,jsonb_build_object('attempt_id',t.id,'study_id',t.study_id,'group_id',t.group_id,'stage_id',t.stage_id,
      'participant_code',p.display_code,'status',t.status,'revision',t.revision,'current_item_id',t.current_item_id,
      'release',jsonb_build_object('id',v.id,'method_version_id',v.method_version_id,'handler_version',v.handler_version,'contract_version',v.contract_version,'form_version',v.form_version),
      'responses',coalesce((SELECT jsonb_agg(jsonb_build_object('item_id',r.item_id,'value',r.value) ORDER BY r.item_id) FROM pedpsy.responses r WHERE r.attempt_id=t.id),'[]'::jsonb),
      'result',CASE WHEN z.id IS NULL THEN NULL ELSE jsonb_build_object('id',z.id,'input_revision',z.input_revision,'responses_digest',z.responses_digest,'calculated_at',z.calculated_at,
        'measures',(SELECT jsonb_agg(jsonb_build_object('code',m->>'code','label',m->>'label','value',m->'value','representation',m->>'representation')) FROM jsonb_array_elements(z.payload->'measures') m)) END) AS record
    FROM pedpsy.attempts t JOIN pedpsy.instrument_releases v ON v.id=t.release_id
    JOIN pedpsy.stage_enrollments e ON (e.study_id,e.id)=(t.study_id,t.enrollment_id) JOIN pedpsy.participants p ON (p.study_id,p.id)=(e.study_id,e.participant_id)
    LEFT JOIN pedpsy.attempt_results z ON z.attempt_id=t.id WHERE attempt IS NULL OR t.id=attempt ORDER BY t.study_id,t.id LIMIT 501
  ) q;
  n:=jsonb_array_length(records);
  IF n>500 THEN RAISE EXCEPTION 'EXPORT_LIMIT' USING ERRCODE='54000';END IF;
  IF attempt IS NOT NULL AND n=0 THEN RAISE EXCEPTION 'NOT_AVAILABLE' USING ERRCODE='P0002';END IF;
  data:=jsonb_build_object('schema_version','pedpsy.staff-protocols.v1','dataset_kind','demo','record_count',n,'protocols',records);
  IF octet_length(data::text)>4194304 THEN RAISE EXCEPTION 'EXPORT_LIMIT' USING ERRCODE='54000';END IF;
  PERFORM pedpsy.lock_staff_operation(operation);
  INSERT INTO pedpsy.access_audit_events(id,at_ms,credential_id,action,outcome,reason,actor_role,resource_id,record_count)
    VALUES(gen_random_uuid(),floor(extract(epoch FROM clock_timestamp())*1000)::bigint,a.credential_id,operation,'allow','GLOBAL_DIAGNOSTICS',a.actor_role,attempt,n);
  PERFORM pedpsy.touch_staff_identity();RETURN data;
END $$;
REVOKE ALL ON FUNCTION staff_protocol_summary(),staff_diagnostic_snapshot(uuid,boolean) FROM PUBLIC;
