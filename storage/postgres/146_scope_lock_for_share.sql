SET LOCAL search_path=pedpsy,pg_catalog;
-- 146: read-only form requests must not serialize on the participant session row.
-- Keep the attempt row lock for CAS and keep revocation semantics: FOR SHARE
-- conflicts with the UPDATE used by logout/revocation.
DO $$
DECLARE d text;
BEGIN
  SELECT pg_get_functiondef('pedpsy.lock_participant_scope(uuid)'::regprocedure) INTO d;
  IF d IS NULL THEN RAISE EXCEPTION 'SCOPE_LOCK_MISSING';END IF;
  IF d LIKE '%participant_sessions WHERE token_hash=current_setting(''app.session_hash'',true) FOR UPDATE%' THEN
    d:=replace(d,'participant_sessions WHERE token_hash=current_setting(''app.session_hash'',true) FOR UPDATE','participant_sessions WHERE token_hash=current_setting(''app.session_hash'',true) FOR SHARE');
    EXECUTE d;
  END IF;
END $$;
