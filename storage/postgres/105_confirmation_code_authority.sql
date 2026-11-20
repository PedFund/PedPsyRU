SET LOCAL search_path=pedpsy,pg_catalog;
-- 105: a confirmation code is a 256-bit secret and must stay usable when the pending
-- browser cookie rotates (page reload, second tab, another browser). Resolution order:
-- exact browser+code, then code within the same invitation, then the latest pending
-- row of this browser (which still drives the wrong-code attempt accounting).
DO $$
DECLARE definition text; fallback text;
BEGIN
  SELECT pg_get_functiondef('pedpsy.confirm_registration_email(text,text,text)'::regprocedure) INTO definition;
  IF position('confirmation_hash=confirmation AND q.status' in definition) > 0 THEN RETURN; END IF;
  fallback := 'IF NOT FOUND THEN' || chr(10) ||
    '    SELECT * INTO p FROM pedpsy.registration_pending q WHERE q.invitation_id=x.invitation_id AND q.confirmation_hash=confirmation AND q.status=''pending''' || chr(10) ||
    '      ORDER BY q.ready_at_ms DESC,q.id LIMIT 1 FOR UPDATE;' || chr(10) ||
    '  END IF;' || chr(10) ||
    '  IF NOT FOUND THEN' || chr(10) ||
    '    SELECT * INTO p FROM pedpsy.registration_pending q WHERE q.invitation_id=x.invitation_id AND q.browser_hash=browser AND q.status=''pending''';
  definition := regexp_replace(definition,
    'IF NOT FOUND THEN[[:space:]]+SELECT \* INTO p FROM pedpsy\.registration_pending q WHERE q\.invitation_id=x\.invitation_id AND q\.browser_hash=browser AND q\.status=''pending''',
    fallback, 'g');
  EXECUTE definition;
END $$;
