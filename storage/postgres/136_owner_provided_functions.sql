SET LOCAL search_path=pedpsy,pg_catalog;
-- 136: allow owner-provided legal texts in registration, passport, login and consent functions.
CREATE OR REPLACE FUNCTION pedpsy.finish_participant_email_login(credential uuid, expected_version integer, derived_hash text, target_contact uuid, session_hash text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pedpsy', 'pg_temp'
AS $function$
DECLARE c record;s record;p record;g record;b record;contact record;policy record;n record;
BEGIN
  SELECT * INTO c FROM pedpsy.participant_credentials q WHERE q.id=credential FOR UPDATE;
  SELECT * INTO s FROM pedpsy.studies q WHERE q.id=c.study_id FOR SHARE;
  SELECT * INTO b FROM pedpsy.participant_group_bindings q WHERE q.study_id=c.study_id AND q.participant_id=c.participant_id FOR SHARE;
  SELECT * INTO g FROM pedpsy.research_groups q WHERE q.study_id=c.study_id AND q.id=b.group_id FOR SHARE;
  SELECT * INTO policy FROM pedpsy.study_contact_policies q WHERE q.study_id=c.study_id FOR SHARE;
  SELECT * INTO n FROM pedpsy.contact_notices q WHERE q.version=policy.notice_version FOR SHARE;
  SELECT * INTO p FROM pedpsy.participants q WHERE q.study_id=c.study_id AND q.id=c.participant_id FOR SHARE;
  SELECT * INTO contact FROM pedpsy.participant_contacts q WHERE q.id=target_contact AND q.study_id=c.study_id AND q.participant_id=c.participant_id FOR SHARE;
  IF c.id IS NULL OR c.status<>'active' OR c.version IS DISTINCT FROM expected_version OR c.password_hash IS DISTINCT FROM derived_hash
    OR s.id IS NULL OR s.status<>'active' OR s.dataset_kind<>'demo' OR p.id IS NULL OR p.status<>'active' OR b.participant_id IS NULL
    OR g.id IS NULL OR g.status<>'active' OR contact.id IS NULL OR contact.status<>'active' OR n.version IS NULL OR n.legal_status NOT IN ('synthetic_only','owner_provided')
    OR NOT EXISTS(SELECT 1 FROM pedpsy.participant_contact_acceptances a WHERE a.study_id=s.id AND a.contact_id=contact.id AND a.notice_version=n.version) THEN
    PERFORM pedpsy.registration_audit('participants.email_login.denied',c.study_id,NULL,false);RETURN NULL;
  END IF;
  -- Reuses the established session rotation/expiry/required audit, after current
  -- contact/group/notice checks under locks; no hashing or mail in this SQL.
  RETURN pedpsy.finish_participant_login(c.id,c.version,c.password_hash,session_hash);
END $function$
;
CREATE OR REPLACE FUNCTION pedpsy.lock_own_consent_scope()
 RETURNS TABLE(owner_study uuid, owner_participant uuid, policy_revision integer, participation_version text, secondary_version text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pedpsy', 'pg_temp'
AS $function$
DECLARE scope record;policy record;document record;document_count integer:=0;
BEGIN
  -- Reuse the existing locked identity/group/contact/current question scope.
  -- It does not require passport completion and does not create a passport.
  SELECT * INTO scope FROM pedpsy.lock_own_passport_scope();
  SELECT * INTO policy FROM pedpsy.study_consent_policies p WHERE p.study_id=scope.owner_study FOR SHARE;
  IF policy.study_id IS NULL THEN RAISE EXCEPTION 'NOT_AVAILABLE' USING ERRCODE='P0002';END IF;
  FOR document IN SELECT d.* FROM pedpsy.consent_documents d
    WHERE (d.purpose='study_participation' AND d.version=policy.participation_version)
      OR (d.purpose='secondary_research' AND d.version=policy.secondary_version)
    ORDER BY d.purpose,d.version FOR SHARE LOOP
    IF document.legal_status NOT IN ('synthetic_only','owner_provided') THEN RAISE EXCEPTION 'NOT_AVAILABLE' USING ERRCODE='P0002';END IF;
    document_count:=document_count+1;
  END LOOP;
  PERFORM pedpsy.assert_own_passport_session();
  IF document_count<>2 THEN RAISE EXCEPTION 'NOT_AVAILABLE' USING ERRCODE='P0002';END IF;
  RETURN QUERY SELECT scope.owner_study,scope.owner_participant,policy.revision,policy.participation_version,policy.secondary_version;
END $function$
;
CREATE OR REPLACE FUNCTION pedpsy.lock_own_passport_scope()
 RETURNS TABLE(owner_study uuid, owner_participant uuid, "current_schema" integer, schema_fields jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pedpsy', 'pg_temp'
AS $function$
DECLARE actor record;binding record;g record;policy record;notice record;contact record;pointer record;schema_record record;
BEGIN
  PERFORM pedpsy.lock_participant_identity();SELECT * INTO actor FROM pedpsy.session_actor() WHERE actor_role='participant';
  SELECT * INTO binding FROM pedpsy.participant_group_bindings WHERE study_id=actor.study_id AND participant_id=actor.participant_id FOR SHARE;
  SELECT * INTO g FROM pedpsy.research_groups WHERE study_id=actor.study_id AND id=binding.group_id FOR SHARE;
  SELECT * INTO policy FROM pedpsy.study_contact_policies WHERE study_id=actor.study_id FOR SHARE;
  SELECT * INTO notice FROM pedpsy.contact_notices WHERE version=policy.notice_version FOR SHARE;
  SELECT * INTO contact FROM pedpsy.participant_contacts WHERE study_id=actor.study_id AND participant_id=actor.participant_id FOR SHARE;
  SELECT * INTO pointer FROM pedpsy.study_passport_schemas WHERE study_id=actor.study_id FOR SHARE;
  SELECT * INTO schema_record FROM pedpsy.passport_schema_versions WHERE study_id=actor.study_id AND schema_version=pointer.schema_version FOR SHARE;
  PERFORM pedpsy.assert_own_passport_session();
  IF binding.participant_id IS NULL OR g.id IS NULL OR g.status<>'active' OR contact.id IS NULL OR contact.status<>'active' OR notice.version IS NULL
    OR notice.legal_status NOT IN ('synthetic_only','owner_provided') OR schema_record.schema_version IS NULL THEN RAISE EXCEPTION 'NOT_AVAILABLE' USING ERRCODE='P0002';END IF;
  IF NOT EXISTS(SELECT 1 FROM pedpsy.participant_contact_acceptances WHERE study_id=actor.study_id AND contact_id=contact.id AND notice_version=notice.version) THEN
    RAISE EXCEPTION 'PARTICIPATION_REQUIREMENTS_CHANGED' USING ERRCODE='P0001';
  END IF;
  -- No active recruitment invite required for an already accepted identity.
  RETURN QUERY SELECT actor.study_id,actor.participant_id,pointer.schema_version,schema_record.fields;
END $function$
;
CREATE OR REPLACE FUNCTION pedpsy.lock_registration_invite(digest text)
 RETURNS TABLE(study_id uuid, group_id uuid, invitation_id uuid, invitation_revision integer, notice_version text, notice_text text, study_title text, group_name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pedpsy', 'pg_temp'
AS $function$
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
    OR n.version IS NULL OR n.legal_status NOT IN ('synthetic_only','owner_provided') THEN RAISE EXCEPTION 'NOT_AVAILABLE' USING ERRCODE='P0002';END IF;
  RETURN QUERY SELECT s.id,g.id,i.id,i.revision,n.version,n.body,s.title,g.name;
END $function$
;
CREATE OR REPLACE FUNCTION pedpsy.own_consents_snapshot(study uuid, participant uuid, policy_revision integer, participation_version text, secondary_version text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pedpsy', 'pg_temp'
AS $function$
DECLARE contact_document record;participation_document record;secondary_document record;contact_at bigint;participation_at bigint;secondary_at bigint;
BEGIN
  SELECT n.version,n.body AS text,n.legal_status INTO contact_document FROM pedpsy.study_contact_policies p
    JOIN pedpsy.contact_notices n ON n.version=p.notice_version WHERE p.study_id=study;
  SELECT min(a.confirmed_at_ms) INTO contact_at FROM pedpsy.participant_contacts c JOIN pedpsy.participant_contact_acceptances a
    ON (a.study_id,a.contact_id)=(c.study_id,c.id) WHERE c.study_id=study AND c.participant_id=participant AND a.notice_version=contact_document.version;
  SELECT d.* INTO participation_document FROM pedpsy.consent_documents d WHERE d.purpose='study_participation' AND d.version=participation_version;
  SELECT d.* INTO secondary_document FROM pedpsy.consent_documents d WHERE d.purpose='secondary_research' AND d.version=secondary_version;
  SELECT a.accepted_at_ms INTO participation_at FROM pedpsy.participant_consent_acceptances a
    WHERE a.study_id=study AND a.participant_id=participant AND a.purpose='study_participation' AND a.document_version=participation_version;
  SELECT a.accepted_at_ms INTO secondary_at FROM pedpsy.participant_consent_acceptances a
    WHERE a.study_id=study AND a.participant_id=participant AND a.purpose='secondary_research' AND a.document_version=secondary_version;
  RETURN jsonb_build_object('study_id',study,'policy_revision',policy_revision,
    'required_consents_accepted',contact_at IS NOT NULL AND participation_at IS NOT NULL,
    'documents',jsonb_build_array(
      jsonb_build_object('purpose','contact_processing','version',contact_document.version,'text',contact_document.text,'legal_status',contact_document.legal_status,
        'required',true,'accepted_at_ms',contact_at,'provenance','contact_notice_confirmation'),
      jsonb_build_object('purpose','study_participation','version',participation_version,'text',participation_document.body_text,'legal_status',participation_document.legal_status,
        'required',true,'accepted_at_ms',participation_at,'provenance','explicit_participant_acceptance'),
      jsonb_build_object('purpose','secondary_research','version',secondary_version,'text',secondary_document.body_text,'legal_status',secondary_document.legal_status,
        'required',false,'accepted_at_ms',secondary_at,'provenance','explicit_participant_acceptance')));
END $function$
;
CREATE OR REPLACE FUNCTION pedpsy.participant_email_login_material_v2(target_study uuid, email text, allow_real_email boolean, global_limit integer, global_window_ms bigint)
 RETURNS TABLE(throttled boolean, credential_id uuid, credential_version integer, salt text, password_hash text, contact_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pedpsy', 'pg_temp'
AS $function$
DECLARE at_ms bigint:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;bucket text;window_ms bigint;limit_n integer;throttle record;c record;contact record;
BEGIN
  IF global_limit IS NULL OR global_limit<1 OR global_limit>1200 OR global_window_ms IS NULL OR global_window_ms<300000 OR global_window_ms>3600000
    THEN RAISE EXCEPTION 'INVALID_LOGIN_POLICY' USING ERRCODE='22023';END IF;
  IF target_study IS NULL OR email IS NULL OR allow_real_email IS NULL OR length(email) NOT BETWEEN 3 AND 254
    OR (allow_real_email AND email !~ '^[A-Za-z0-9!#$%&''*+/=?^_`{|}~-]+([.][A-Za-z0-9!#$%&''*+/=?^_`{|}~-]+)*@[^@[:space:]]+$')
    OR (NOT allow_real_email AND email !~ '^[A-Za-z0-9!#$%&''*+/=?^_`{|}~-]+([.][A-Za-z0-9!#$%&''*+/=?^_`{|}~-]+)*@example[.]test$')
    THEN RAISE EXCEPTION 'INVALID_REGISTRATION_INPUT' USING ERRCODE='22023';END IF;
  -- Same bounded admission lock/global bucket as existing participant code
  -- login. A known credential also shares its old per-code bucket; no bypass.
  PERFORM pg_advisory_xact_lock(5151980003);
  SELECT * INTO contact FROM pedpsy.participant_contacts q WHERE q.study_id=target_study AND q.email_key=email;
  SELECT * INTO c FROM pedpsy.participant_credentials q WHERE q.study_id=target_study AND q.participant_id=contact.participant_id;
  FOR bucket,window_ms,limit_n IN
    SELECT 'pedpsy-login:global',global_window_ms,global_limit UNION ALL
    SELECT 'pedpsy-email-login:'||target_study::text||':'||email,900000::bigint,5 UNION ALL
    SELECT 'pedpsy-login:'||c.login_id,900000::bigint,5 WHERE c.id IS NOT NULL LOOP
    bucket:='sha256:'||encode(sha256(convert_to(bucket,'UTF8')),'hex');
    SELECT * INTO throttle FROM pedpsy.login_throttles q WHERE q.bucket_hash=bucket FOR UPDATE;
    IF FOUND AND at_ms-throttle.window_start_ms<window_ms AND throttle.count>=limit_n THEN
      PERFORM pedpsy.registration_audit('participants.email_login.throttled',target_study,NULL,false);
      RETURN QUERY SELECT true,NULL::uuid,NULL::integer,NULL::text,NULL::text,NULL::uuid;RETURN;
    END IF;
    INSERT INTO pedpsy.login_throttles(bucket_hash,window_start_ms,count) VALUES(bucket,at_ms,1)
      ON CONFLICT(bucket_hash) DO UPDATE SET window_start_ms=CASE WHEN at_ms-login_throttles.window_start_ms>=window_ms THEN at_ms ELSE login_throttles.window_start_ms END,
      count=CASE WHEN at_ms-login_throttles.window_start_ms>=window_ms THEN 1 ELSE login_throttles.count+1 END;
  END LOOP;
  RETURN QUERY SELECT false,c.id,c.version,c.salt,c.password_hash,contact.id FROM pedpsy.studies s
    JOIN pedpsy.participants p ON p.study_id=s.id AND p.id=contact.participant_id
    JOIN pedpsy.participant_group_bindings b ON (b.study_id,b.participant_id)=(p.study_id,p.id)
    JOIN pedpsy.research_groups g ON (g.study_id,g.id)=(b.study_id,b.group_id)
    JOIN pedpsy.study_contact_policies policy ON policy.study_id=s.id JOIN pedpsy.contact_notices n ON n.version=policy.notice_version
    WHERE s.id=target_study AND s.status='active' AND s.dataset_kind='demo' AND p.status='active' AND g.status='active'
      AND c.id IS NOT NULL AND c.status='active' AND contact.status='active' AND n.legal_status IN ('synthetic_only','owner_provided')
      AND EXISTS(SELECT 1 FROM pedpsy.participant_contact_acceptances a WHERE a.study_id=s.id AND a.contact_id=contact.id AND a.notice_version=n.version);
END $function$
;
CREATE OR REPLACE FUNCTION pedpsy.registration_context(digest text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pedpsy', 'pg_temp'
AS $function$
DECLARE x record;data jsonb;notice_status text;
BEGIN
  SELECT * INTO x FROM pedpsy.lock_registration_invite(digest);
  SELECT n.legal_status INTO notice_status FROM pedpsy.contact_notices n WHERE n.version=x.notice_version;
  data:=jsonb_build_object('study_id',x.study_id,'study_title',x.study_title,'group_name',x.group_name,
    'contact_notice',jsonb_build_object('version',x.notice_version,'text',x.notice_text,'legal_status',notice_status));
  IF length(x.study_title)>200 OR length(x.group_name)>100 OR octet_length(data::text)>65536 THEN RAISE EXCEPTION 'REGISTRATION_LIMIT' USING ERRCODE='54000';END IF;
  PERFORM pedpsy.registration_audit('participants.registration.context',x.study_id,x.invitation_id);RETURN data;
END $function$
;
CREATE OR REPLACE FUNCTION pedpsy.registration_landing(digest text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pedpsy', 'pg_temp'
AS $function$
DECLARE x record;data jsonb;notice_status text;
BEGIN
  SELECT * INTO x FROM pedpsy.lock_registration_invite(digest);
  SELECT n.legal_status INTO notice_status FROM pedpsy.contact_notices n WHERE n.version=x.notice_version;
  data:=jsonb_build_object('study_title',x.study_title,'group_name',x.group_name,'contact_notice',jsonb_build_object('version',x.notice_version,'text',x.notice_text,'legal_status',notice_status));
  IF length(x.study_title)>200 OR length(x.group_name)>100 OR octet_length(data::text)>65536 THEN RAISE EXCEPTION 'REGISTRATION_LIMIT' USING ERRCODE='54000';END IF;
  PERFORM pedpsy.registration_audit('participants.registration.landing',x.study_id,x.invitation_id);RETURN data;
END $function$
;
