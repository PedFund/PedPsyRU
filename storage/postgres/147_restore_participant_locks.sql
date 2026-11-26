SET LOCAL search_path=pedpsy,pg_catalog;
-- 147: form reads use an explicit read-only path instead of weakening the
-- session lock for participant writes. Restore exclusive identity/scope locks.
DO $$
DECLARE d text; fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY['pedpsy.lock_participant_identity()','pedpsy.lock_participant_scope(uuid)'] LOOP
    EXECUTE format('SELECT pg_get_functiondef(%L::regprocedure)', fn) INTO d;
    IF d IS NULL THEN RAISE EXCEPTION 'PARTICIPANT_LOCK_MISSING';END IF;
    IF d LIKE '%participant_sessions WHERE token_hash=current_setting(''app.session_hash'',true) FOR SHARE%' THEN
      d:=replace(d,'participant_sessions WHERE token_hash=current_setting(''app.session_hash'',true) FOR SHARE','participant_sessions WHERE token_hash=current_setting(''app.session_hash'',true) FOR UPDATE');
      EXECUTE d;
    END IF;
  END LOOP;
END $$;
