SET LOCAL search_path=pedpsy,pg_catalog;
-- Anonymous, fixed metadata-only denial. No raw URL/header/body/contact/token,
-- and never use a staff/researcher cookie as the registration actor.
CREATE FUNCTION record_registration_http_denial(reason_code text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
BEGIN
  IF reason_code IS NULL OR reason_code !~ '^[A-Z][A-Z0-9_]{0,63}$' THEN RAISE EXCEPTION 'INVALID_REGISTRATION_AUDIT_REASON' USING ERRCODE='22023';END IF;
  INSERT INTO pedpsy.access_audit_events(id,at_ms,action,outcome,reason)
    VALUES(gen_random_uuid(),floor(extract(epoch FROM clock_timestamp())*1000)::bigint,'participants.registration.http_denied','deny',reason_code);
END $$;
REVOKE ALL ON FUNCTION record_registration_http_denial(text) FROM PUBLIC;
