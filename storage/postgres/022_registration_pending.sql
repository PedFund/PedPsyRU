SET LOCAL search_path=pedpsy,pg_catalog;
-- Synthetic contact notice only. No real legal text or mail provider enabled.
CREATE TABLE contact_notices (
  version text PRIMARY KEY CHECK(version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$'),
  body text NOT NULL CHECK(length(body) BETWEEN 1 AND 8192),legal_status text NOT NULL CHECK(legal_status='synthetic_only')
);
INSERT INTO contact_notices VALUES('demo-contact-1','Учебный контур ПедПси. Используйте только вымышленные адреса @example.test и вымышленные данные. Настоящие письма не отправляются. Это тестовый текст для проверки интерфейса, не утверждённые юридические условия.','synthetic_only');
CREATE TRIGGER contact_notice_immutable BEFORE UPDATE OR DELETE ON contact_notices FOR EACH ROW EXECUTE FUNCTION immutable_row();
-- Operational policy is separate from frozen design and legacy domain snapshot.
CREATE TABLE study_contact_policies(study_id uuid PRIMARY KEY REFERENCES studies(id),notice_version text NOT NULL REFERENCES contact_notices(version));
CREATE INDEX study_contact_notice ON study_contact_policies(notice_version);
INSERT INTO study_contact_policies SELECT id,'demo-contact-1' FROM studies;
CREATE FUNCTION initialize_study_contact_policy() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
BEGIN INSERT INTO pedpsy.study_contact_policies(study_id,notice_version) VALUES(NEW.id,'demo-contact-1');RETURN NEW;END $$;
CREATE TRIGGER study_contact_policy_init AFTER INSERT ON studies FOR EACH ROW EXECUTE FUNCTION initialize_study_contact_policy();
CREATE TABLE registration_pending (
  id uuid PRIMARY KEY,study_id uuid NOT NULL,group_id uuid NOT NULL,invitation_id uuid NOT NULL,
  invitation_revision integer NOT NULL CHECK(invitation_revision BETWEEN 0 AND 2147483646),
  browser_hash text NOT NULL CHECK(browser_hash ~ '^sha256:[a-f0-9]{64}$'),
  email_key text NOT NULL CHECK(length(email_key) BETWEEN 14 AND 77 AND email_key ~ '^[A-Za-z0-9!#$%&''*+/=?^_`{|}~-]+([.][A-Za-z0-9!#$%&''*+/=?^_`{|}~-]+)*@example[.]test$'),
  contact_notice_version text NOT NULL REFERENCES contact_notices(version),
  status text NOT NULL DEFAULT 'reserved' CHECK(status IN ('reserved','pending','confirmed','cancelled')),
  created_at_ms bigint NOT NULL CHECK(created_at_ms BETWEEN 0 AND 9007199254740991),
  expires_at_ms bigint NOT NULL CHECK(expires_at_ms>created_at_ms AND expires_at_ms<=created_at_ms+3600000),
  ready_at_ms bigint CHECK(ready_at_ms>=created_at_ms),confirmed_at_ms bigint CHECK(confirmed_at_ms>=ready_at_ms),
  scheme text CHECK(scheme='scrypt-N131072-r8-p1-dk64'),salt text CHECK(salt ~ '^[a-f0-9]{32}$'),
  password_hash text CHECK(password_hash ~ '^[a-f0-9]{128}$'),confirmation_hash text UNIQUE CHECK(confirmation_hash ~ '^sha256:[a-f0-9]{64}$'),
  attempts_remaining integer NOT NULL DEFAULT 5 CHECK(attempts_remaining BETWEEN 0 AND 5),
  CHECK((ready_at_ms IS NULL AND scheme IS NULL AND salt IS NULL AND password_hash IS NULL AND confirmation_hash IS NULL AND status IN ('reserved','cancelled')) OR
    (ready_at_ms IS NOT NULL AND scheme IS NOT NULL AND salt IS NOT NULL AND password_hash IS NOT NULL AND confirmation_hash IS NOT NULL AND status IN ('pending','confirmed','cancelled'))),
  CHECK((status='confirmed' AND confirmed_at_ms IS NOT NULL) OR (status<>'confirmed' AND confirmed_at_ms IS NULL)),
  FOREIGN KEY(study_id,group_id,invitation_id) REFERENCES group_invitations(study_id,group_id,id)
);
CREATE UNIQUE INDEX registration_pending_current ON registration_pending(study_id,email_key,browser_hash) WHERE status IN ('reserved','pending');
CREATE INDEX registration_pending_invite ON registration_pending(study_id,group_id,invitation_id);
CREATE INDEX registration_pending_notice ON registration_pending(contact_notice_version);
CREATE INDEX registration_pending_live ON registration_pending(study_id,status,expires_at_ms);
CREATE TABLE contact_confirmation_outbox (
  id uuid PRIMARY KEY,pending_id uuid NOT NULL UNIQUE REFERENCES registration_pending(id),
  purpose text NOT NULL DEFAULT 'email_confirmation' CHECK(purpose='email_confirmation'),
  recipient text NOT NULL CHECK(length(recipient) BETWEEN 14 AND 77 AND recipient ~ '^[A-Za-z0-9!#$%&''*+/=?^_`{|}~-]+([.][A-Za-z0-9!#$%&''*+/=?^_`{|}~-]+)*@example[.]test$'),
  token_envelope text NOT NULL CHECK(token_envelope ~ '^v1[.][A-Za-z0-9_-]{16}[.][A-Za-z0-9_-]{58}[.][A-Za-z0-9_-]{22}$'),
  status text NOT NULL DEFAULT 'ready' CHECK(status IN ('ready','sent','cancelled')),
  created_at_ms bigint NOT NULL CHECK(created_at_ms>=0),expires_at_ms bigint NOT NULL CHECK(expires_at_ms>created_at_ms),
  attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 10),next_attempt_at_ms bigint NOT NULL CHECK(next_attempt_at_ms>=created_at_ms),
  sent_at_ms bigint CHECK(sent_at_ms>=created_at_ms),
  CHECK((status='sent' AND sent_at_ms IS NOT NULL) OR (status<>'sent' AND sent_at_ms IS NULL))
);
CREATE INDEX contact_outbox_ready ON contact_confirmation_outbox(next_attempt_at_ms,id) WHERE status='ready';
ALTER TABLE contact_notices ENABLE ROW LEVEL SECURITY;ALTER TABLE study_contact_policies ENABLE ROW LEVEL SECURITY;ALTER TABLE registration_pending ENABLE ROW LEVEL SECURITY;ALTER TABLE contact_confirmation_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON contact_notices,study_contact_policies,registration_pending,contact_confirmation_outbox FROM PUBLIC;
CREATE FUNCTION guard_registration_pending() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,pedpsy AS $$
BEGIN
  IF TG_OP='DELETE' OR (NEW.id,NEW.study_id,NEW.group_id,NEW.invitation_id,NEW.invitation_revision,NEW.browser_hash,NEW.email_key,NEW.contact_notice_version,NEW.created_at_ms)
    IS DISTINCT FROM (OLD.id,OLD.study_id,OLD.group_id,OLD.invitation_id,OLD.invitation_revision,OLD.browser_hash,OLD.email_key,OLD.contact_notice_version,OLD.created_at_ms)
    THEN RAISE EXCEPTION 'registration scope frozen' USING ERRCODE='23514';END IF;
  IF OLD.status='reserved' AND NEW.status='pending' AND NEW.attempts_remaining=OLD.attempts_remaining THEN RETURN NEW;END IF;
  IF (NEW.scheme,NEW.salt,NEW.password_hash,NEW.confirmation_hash,NEW.ready_at_ms,NEW.expires_at_ms)
    IS NOT DISTINCT FROM (OLD.scheme,OLD.salt,OLD.password_hash,OLD.confirmation_hash,OLD.ready_at_ms,OLD.expires_at_ms) THEN
    IF OLD.status IN ('reserved','pending') AND NEW.status='cancelled' AND NEW.attempts_remaining=OLD.attempts_remaining THEN RETURN NEW;END IF;
    IF OLD.status='pending' AND NEW.status='confirmed' AND NEW.attempts_remaining=OLD.attempts_remaining THEN RETURN NEW;END IF;
    IF OLD.status='pending' AND NEW.status='pending' AND NEW.attempts_remaining=OLD.attempts_remaining-1 THEN RETURN NEW;END IF;
  END IF;
  RAISE EXCEPTION 'registration transition frozen' USING ERRCODE='23514';
END $$;
CREATE TRIGGER registration_pending_guard BEFORE UPDATE OR DELETE ON registration_pending FOR EACH ROW EXECUTE FUNCTION guard_registration_pending();
CREATE FUNCTION guard_contact_outbox() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,pedpsy AS $$
BEGIN
  IF TG_OP='DELETE' OR (NEW.id,NEW.pending_id,NEW.purpose,NEW.recipient,NEW.token_envelope,NEW.created_at_ms,NEW.expires_at_ms)
    IS DISTINCT FROM (OLD.id,OLD.pending_id,OLD.purpose,OLD.recipient,OLD.token_envelope,OLD.created_at_ms,OLD.expires_at_ms)
    OR OLD.status<>'ready' OR NEW.attempts NOT BETWEEN OLD.attempts AND OLD.attempts+1 OR NEW.next_attempt_at_ms<OLD.next_attempt_at_ms
    THEN RAISE EXCEPTION 'confirmation outbox identity frozen' USING ERRCODE='23514';END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER contact_outbox_guard BEFORE UPDATE OR DELETE ON contact_confirmation_outbox FOR EACH ROW EXECUTE FUNCTION guard_contact_outbox();
-- Pre-read is only a lock target. Current authority is checked after locks in
-- the same study -> group -> invitation -> notice order as manager operations.
CREATE FUNCTION lock_registration_invite(digest text) RETURNS TABLE(study_id uuid,group_id uuid,invitation_id uuid,invitation_revision integer,
  notice_version text,notice_text text,study_title text,group_name text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE target record;s record;g record;i record;n record;policy record;
BEGIN
  IF digest IS NULL OR digest !~ '^sha256:[a-f0-9]{64}$' THEN RAISE EXCEPTION 'NOT_AVAILABLE' USING ERRCODE='P0002';END IF;
  SELECT q.study_id,q.group_id,q.id INTO target FROM pedpsy.group_invitations q WHERE q.token_hash=digest;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_AVAILABLE' USING ERRCODE='P0002';END IF;
  SELECT * INTO s FROM pedpsy.studies q WHERE q.id=target.study_id FOR SHARE;
  SELECT * INTO g FROM pedpsy.research_groups q WHERE q.study_id=target.study_id AND q.id=target.group_id FOR SHARE;
  SELECT * INTO i FROM pedpsy.group_invitations q WHERE q.id=target.id AND q.token_hash=digest FOR SHARE;
  SELECT * INTO policy FROM pedpsy.study_contact_policies q WHERE q.study_id=s.id FOR SHARE;
  SELECT * INTO n FROM pedpsy.contact_notices q WHERE q.version=policy.notice_version FOR SHARE;
  IF s.id IS NULL OR s.status<>'active' OR s.dataset_kind<>'demo' OR g.id IS NULL OR g.status<>'active'
    OR i.id IS NULL OR i.status<>'active' OR i.expires_at_ms<=floor(extract(epoch FROM clock_timestamp())*1000)::bigint
    OR n.version IS NULL OR n.legal_status<>'synthetic_only' THEN RAISE EXCEPTION 'NOT_AVAILABLE' USING ERRCODE='P0002';END IF;
  RETURN QUERY SELECT s.id,g.id,i.id,i.revision,n.version,n.body,s.title,g.name;
END $$;
CREATE FUNCTION registration_audit(operation text,study uuid,target uuid,allowed boolean DEFAULT true) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
  INSERT INTO pedpsy.access_audit_events(id,at_ms,study_id,action,outcome,reason,resource_id)
    VALUES(gen_random_uuid(),floor(extract(epoch FROM clock_timestamp())*1000)::bigint,study,operation,CASE WHEN allowed THEN 'allow' ELSE 'deny' END,'SYNTHETIC_REGISTRATION',target)
$$;
CREATE FUNCTION registration_landing(digest text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE x record;data jsonb;
BEGIN
  SELECT * INTO x FROM pedpsy.lock_registration_invite(digest);
  data:=jsonb_build_object('study_title',x.study_title,'group_name',x.group_name,'contact_notice',jsonb_build_object('version',x.notice_version,'text',x.notice_text,'legal_status','synthetic_only'));
  IF length(x.study_title)>200 OR length(x.group_name)>100 OR octet_length(data::text)>65536 THEN RAISE EXCEPTION 'REGISTRATION_LIMIT' USING ERRCODE='54000';END IF;
  PERFORM pedpsy.registration_audit('participants.registration.landing',x.study_id,x.invitation_id);RETURN data;
END $$;
CREATE FUNCTION reserve_registration_start(digest text,browser text,email text,notice text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE x record;at_ms bigint;bucket text;window_ms bigint;limit_n integer;throttle record;target uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(5151980006);SELECT * INTO x FROM pedpsy.lock_registration_invite(digest);
  IF browser IS NULL OR browser !~ '^sha256:[a-f0-9]{64}$' OR browser=digest OR email IS NULL OR length(email) NOT BETWEEN 14 AND 77
    OR email !~ '^[A-Za-z0-9!#$%&''*+/=?^_`{|}~-]+([.][A-Za-z0-9!#$%&''*+/=?^_`{|}~-]+)*@example[.]test$'
    THEN RAISE EXCEPTION 'INVALID_REGISTRATION_INPUT' USING ERRCODE='22023';END IF;
  IF notice IS DISTINCT FROM x.notice_version THEN RAISE EXCEPTION 'PARTICIPATION_REQUIREMENTS_CHANGED' USING ERRCODE='P0001';END IF;
  at_ms:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
  FOR bucket,window_ms,limit_n IN SELECT 'global',300000::bigint,30 UNION ALL SELECT 'browser:'||browser,900000::bigint,5 UNION ALL SELECT 'email:'||x.study_id::text||':'||email,900000::bigint,5 LOOP
    bucket:='sha256:'||encode(sha256(convert_to('pedpsy-registration-start:'||bucket,'UTF8')),'hex');
    SELECT * INTO throttle FROM pedpsy.login_throttles q WHERE q.bucket_hash=bucket FOR UPDATE;
    IF FOUND AND at_ms-throttle.window_start_ms<window_ms AND throttle.count>=limit_n THEN
      PERFORM pedpsy.registration_audit('participants.registration.throttled',x.study_id,NULL,false);RETURN NULL;
    END IF;
    INSERT INTO pedpsy.login_throttles(bucket_hash,window_start_ms,count) VALUES(bucket,at_ms,1)
      ON CONFLICT(bucket_hash) DO UPDATE SET window_start_ms=CASE WHEN at_ms-login_throttles.window_start_ms>=window_ms THEN at_ms ELSE login_throttles.window_start_ms END,
      count=CASE WHEN at_ms-login_throttles.window_start_ms>=window_ms THEN 1 ELSE login_throttles.count+1 END;
  END LOOP;
  IF (SELECT count(*) FROM pedpsy.registration_pending q WHERE q.study_id=x.study_id AND q.status IN ('reserved','pending') AND q.expires_at_ms>at_ms AND NOT(q.email_key=email AND q.browser_hash=browser))>=1000
    THEN RAISE EXCEPTION 'REGISTRATION_LIMIT' USING ERRCODE='54000';END IF;
  UPDATE pedpsy.contact_confirmation_outbox o SET status='cancelled' WHERE o.status='ready' AND o.pending_id IN
    (SELECT q.id FROM pedpsy.registration_pending q WHERE q.study_id=x.study_id AND q.email_key=email AND q.browser_hash=browser AND q.status IN ('reserved','pending'));
  UPDATE pedpsy.registration_pending q SET status='cancelled' WHERE q.study_id=x.study_id AND q.email_key=email AND q.browser_hash=browser AND q.status IN ('reserved','pending');
  target:=gen_random_uuid();
  INSERT INTO pedpsy.registration_pending(id,study_id,group_id,invitation_id,invitation_revision,browser_hash,email_key,contact_notice_version,created_at_ms,expires_at_ms)
    VALUES(target,x.study_id,x.group_id,x.invitation_id,x.invitation_revision,browser,email,notice,at_ms,at_ms+60000);
  PERFORM pedpsy.registration_audit('participants.registration.reserve',x.study_id,target);RETURN target;
END $$;
CREATE FUNCTION queue_registration_confirmation(target uuid,browser text,new_salt text,new_password_hash text,confirmation text,delivery uuid,envelope text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE hint record;x record;p record;at_ms bigint;
BEGIN
  PERFORM pg_advisory_xact_lock(5151980006);
  SELECT i.token_hash INTO hint FROM pedpsy.registration_pending q JOIN pedpsy.group_invitations i ON i.id=q.invitation_id WHERE q.id=target;
  SELECT * INTO x FROM pedpsy.lock_registration_invite(hint.token_hash);
  SELECT * INTO p FROM pedpsy.registration_pending q WHERE q.id=target FOR UPDATE;at_ms:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
  IF p.id IS NULL OR p.status<>'reserved' OR p.browser_hash IS DISTINCT FROM browser OR at_ms>=p.expires_at_ms
    OR (p.study_id,p.group_id,p.invitation_id,p.invitation_revision) IS DISTINCT FROM (x.study_id,x.group_id,x.invitation_id,x.invitation_revision)
    THEN RAISE EXCEPTION 'NOT_AVAILABLE' USING ERRCODE='P0002';END IF;
  IF p.contact_notice_version IS DISTINCT FROM x.notice_version THEN RAISE EXCEPTION 'PARTICIPATION_REQUIREMENTS_CHANGED' USING ERRCODE='P0001';END IF;
  IF new_salt IS NULL OR new_salt !~ '^[a-f0-9]{32}$' OR new_password_hash IS NULL OR new_password_hash !~ '^[a-f0-9]{128}$'
    OR confirmation IS NULL OR confirmation !~ '^sha256:[a-f0-9]{64}$' OR confirmation IN (browser,hint.token_hash)
    OR delivery IS NULL OR envelope IS NULL OR envelope !~ '^v1[.][A-Za-z0-9_-]{16}[.][A-Za-z0-9_-]{58}[.][A-Za-z0-9_-]{22}$'
    THEN RAISE EXCEPTION 'INVALID_REGISTRATION_INPUT' USING ERRCODE='22023';END IF;
  UPDATE pedpsy.registration_pending SET status='pending',ready_at_ms=at_ms,expires_at_ms=at_ms+1800000,
    scheme='scrypt-N131072-r8-p1-dk64',salt=new_salt,password_hash=new_password_hash,confirmation_hash=confirmation WHERE id=p.id;
  INSERT INTO pedpsy.contact_confirmation_outbox(id,pending_id,recipient,token_envelope,created_at_ms,expires_at_ms,next_attempt_at_ms)
    VALUES(delivery,p.id,p.email_key,envelope,at_ms,at_ms+1800000,at_ms);
  PERFORM pedpsy.registration_audit('participants.registration.requested',x.study_id,p.id);
END $$;
REVOKE ALL ON FUNCTION initialize_study_contact_policy(),guard_registration_pending(),guard_contact_outbox(),lock_registration_invite(text),registration_audit(text,uuid,uuid,boolean),
  registration_landing(text),reserve_registration_start(text,text,text,text),queue_registration_confirmation(uuid,text,text,text,text,uuid,text) FROM PUBLIC;
