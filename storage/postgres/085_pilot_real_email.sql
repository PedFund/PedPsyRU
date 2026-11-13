SET LOCAL search_path=pedpsy,pg_catalog;
-- 086: pilot mode accepts real email addresses as login identifiers. The
-- application still enables this only when PEDPSY_PILOT_REAL_EMAIL=1; the
-- default remains the synthetic @example.test contour.
ALTER TABLE pedpsy.registration_pending DROP CONSTRAINT registration_pending_email_key_check;
ALTER TABLE pedpsy.registration_pending ADD CONSTRAINT registration_pending_email_key_check
  CHECK(length(email_key) BETWEEN 3 AND 254 AND email_key ~ '^[^@[:space:]]+@[^@[:space:]]+$');
ALTER TABLE pedpsy.contact_confirmation_outbox DROP CONSTRAINT contact_confirmation_outbox_recipient_check;
ALTER TABLE pedpsy.contact_confirmation_outbox ADD CONSTRAINT contact_confirmation_outbox_recipient_check
  CHECK(length(recipient) BETWEEN 3 AND 254 AND recipient ~ '^[^@[:space:]]+@[^@[:space:]]+$');
ALTER TABLE pedpsy.participant_contacts DROP CONSTRAINT participant_contacts_email_key_check;
ALTER TABLE pedpsy.participant_contacts ADD CONSTRAINT participant_contacts_email_key_check
  CHECK(length(email_key) BETWEEN 3 AND 254 AND email_key ~ '^[^@[:space:]]+@[^@[:space:]]+$');
ALTER TABLE pedpsy.research_reminder_outbox DROP CONSTRAINT research_reminder_outbox_email_check;
ALTER TABLE pedpsy.research_reminder_outbox ADD CONSTRAINT research_reminder_outbox_email_check
  CHECK(length(email) BETWEEN 3 AND 254 AND email ~ '^[^@[:space:]]+@[^@[:space:]]+$');
DO $$
DECLARE definition text;
BEGIN
  SELECT pg_get_functiondef('pedpsy.reserve_registration_start(text,text,text,text)'::regprocedure) INTO definition;
  definition:=replace(definition,'@example[.]test$','@[^@[:space:]]+$');
  EXECUTE definition;
  SELECT pg_get_functiondef('pedpsy.confirm_registration_email(text,text,text)'::regprocedure) INTO definition;
  definition:=replace(definition,'@example[.]test$','@[^@[:space:]]+$');
  EXECUTE definition;
END $$;
