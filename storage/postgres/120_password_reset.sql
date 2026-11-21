SET LOCAL search_path=pedpsy,pg_catalog;
-- 120: password reset by e-mailed one-time code. The request is neutral for unknown
-- addresses; only an active contact with an active credential receives a mail. Codes
-- are stored as SHA-256 digests, expire in 30 minutes and allow five attempts.
CREATE TABLE IF NOT EXISTS password_resets(
  id uuid PRIMARY KEY,
  study_id uuid NOT NULL,
  participant_id uuid NOT NULL,
  code_hash text NOT NULL CHECK(code_hash ~ '^sha256:[a-f0-9]{64}$'),
  created_at_ms bigint NOT NULL CHECK(created_at_ms>=0),
  expires_at_ms bigint NOT NULL CHECK(expires_at_ms>created_at_ms),
  attempts_remaining integer NOT NULL CHECK(attempts_remaining BETWEEN 0 AND 5),
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','used','cancelled')),
  used_at_ms bigint
);
CREATE INDEX password_resets_scope ON password_resets(study_id,participant_id,created_at_ms DESC);
REVOKE ALL ON password_resets FROM PUBLIC;

CREATE OR REPLACE FUNCTION create_password_reset(invite_digest text, email text, code_hash text, ttl_ms bigint) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE x record;contact record;credential record;at bigint;normalized text;
BEGIN
  IF invite_digest IS NULL OR email IS NULL OR code_hash !~ '^sha256:[a-f0-9]{64}$' OR ttl_ms IS NULL OR ttl_ms NOT BETWEEN 60000 AND 86400000 THEN
    RAISE EXCEPTION 'INVALID_INPUT' USING ERRCODE='22023';
  END IF;
  SELECT * INTO x FROM pedpsy.lock_registration_invite(invite_digest);
  IF x.invitation_id IS NULL THEN RETURN false;END IF;
  normalized:=lower(btrim(email));
  SELECT * INTO contact FROM pedpsy.participant_contacts c
    WHERE c.study_id=x.study_id AND c.email_key=normalized AND c.status='active';
  IF contact.id IS NULL THEN RETURN false;END IF;
  SELECT * INTO credential FROM pedpsy.participant_credentials c
    WHERE c.study_id=x.study_id AND c.participant_id=contact.participant_id AND c.status='active';
  IF credential.id IS NULL THEN RETURN false;END IF;
  at:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
  UPDATE pedpsy.password_resets SET status='cancelled' WHERE study_id=x.study_id AND participant_id=contact.participant_id AND status='pending';
  INSERT INTO pedpsy.password_resets(id,study_id,participant_id,code_hash,created_at_ms,expires_at_ms,attempts_remaining)
    VALUES(gen_random_uuid(),x.study_id,contact.participant_id,code_hash,at,at+ttl_ms,5);
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION create_password_reset(text,text,text,bigint) FROM PUBLIC;

CREATE OR REPLACE FUNCTION consume_password_reset(invite_digest text, email text, code_hash text, new_scheme text, new_salt text, new_hash text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE x record;target record;at bigint;
BEGIN
  IF invite_digest IS NULL OR email IS NULL OR code_hash !~ '^sha256:[a-f0-9]{64}$' OR new_scheme IS NULL OR new_salt IS NULL OR new_hash IS NULL THEN
    RETURN 'none';
  END IF;
  SELECT * INTO x FROM pedpsy.lock_registration_invite(invite_digest);
  IF x.invitation_id IS NULL THEN RETURN 'none';END IF;
  at:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
  SELECT r.* INTO target FROM pedpsy.password_resets r
    JOIN pedpsy.participant_contacts c ON (c.study_id,c.participant_id)=(r.study_id,r.participant_id)
    WHERE r.study_id=x.study_id AND c.email_key=lower(btrim(email)) AND c.status='active'
      AND r.status='pending' AND r.expires_at_ms>at
    ORDER BY r.created_at_ms DESC LIMIT 1 FOR UPDATE;
  IF target.id IS NULL THEN RETURN 'none';END IF;
  IF target.code_hash<>code_hash THEN
    IF target.attempts_remaining<=1 THEN
      UPDATE pedpsy.password_resets SET status='cancelled' WHERE id=target.id;
    ELSE
      UPDATE pedpsy.password_resets SET attempts_remaining=attempts_remaining-1 WHERE id=target.id;
    END IF;
    RETURN 'none';
  END IF;
  UPDATE pedpsy.participant_credentials SET scheme=new_scheme,salt=new_salt,password_hash=new_hash,version=version+1
    WHERE study_id=target.study_id AND participant_id=target.participant_id AND status='active';
  IF NOT FOUND THEN RETURN 'none';END IF;
  UPDATE pedpsy.password_resets SET status='used',used_at_ms=at WHERE id=target.id;
  RETURN 'ok';
END $$;
REVOKE ALL ON FUNCTION consume_password_reset(text,text,text,text,text,text) FROM PUBLIC;
