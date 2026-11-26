SET LOCAL search_path=pedpsy,pg_catalog;
-- 148: read-only participant requests opt into FOR SHARE locks through a
-- transaction-local flag. Normal writes keep the original FOR UPDATE locks.
DO $$
DECLARE d text; fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY['pedpsy.lock_participant_identity()','pedpsy.lock_participant_scope(uuid)'] LOOP
    EXECUTE format('SELECT pg_get_functiondef(%L::regprocedure)', fn) INTO d;
    IF d IS NULL THEN RAISE EXCEPTION 'PARTICIPANT_LOCK_MISSING';END IF;
    IF d LIKE '%PERFORM 1 FROM pedpsy.participant_sessions WHERE token_hash=current_setting(''app.session_hash'',true) FOR UPDATE;%' THEN
      d:=replace(d,
        'PERFORM 1 FROM pedpsy.participant_sessions WHERE token_hash=current_setting(''app.session_hash'',true) FOR UPDATE;',
        'IF current_setting(''app.participant_read'',true)=''1'' THEN PERFORM 1 FROM pedpsy.participant_sessions WHERE token_hash=current_setting(''app.session_hash'',true) FOR SHARE; ELSE PERFORM 1 FROM pedpsy.participant_sessions WHERE token_hash=current_setting(''app.session_hash'',true) FOR UPDATE; END IF;');
      EXECUTE d;
    END IF;
  END LOOP;
END $$;
