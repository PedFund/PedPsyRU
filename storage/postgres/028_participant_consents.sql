SET LOCAL search_path=pedpsy,pg_catalog;
-- Synthetic document versions only. No legal approval, production data,
-- participant withdrawal/self-return or administrative impersonation.
CREATE TABLE consent_documents(
  purpose text NOT NULL CHECK(purpose IN ('study_participation','secondary_research')),
  version text NOT NULL CHECK(version ~ '^[a-z][a-z0-9_-]{0,63}$'),
  body_text text NOT NULL CHECK(length(body_text) BETWEEN 1 AND 20000 AND body_text !~ '[[:cntrl:]]'),
  legal_status text NOT NULL DEFAULT 'synthetic_only' CHECK(legal_status='synthetic_only'),
  PRIMARY KEY(purpose,version)
);
INSERT INTO consent_documents(purpose,version,body_text) VALUES
('study_participation','demo-participation-1','Учебное участие в вымышленном исследовании ПедПси. Только синтетические данные. Это текст для проверки явного принятия условий, не утверждённый юридический документ. Принятие не означает согласия на последующее научное использование. Обращения к оператору рассматриваются отдельно; учебный интерфейс не ограничивает законные права.'),
('secondary_research','demo-secondary-1','Отдельный добровольный выбор для проверки согласия на последующее научное использование исключительно вымышленных данных. Отказ не препятствует учебному текущему исследованию. Этот текст не утверждён юридически и не разрешает обработку реальных данных.');
CREATE TRIGGER consent_document_immutable BEFORE UPDATE OR DELETE ON consent_documents FOR EACH ROW EXECUTE FUNCTION immutable_row();
CREATE TABLE study_consent_policies(
  study_id uuid PRIMARY KEY REFERENCES studies(id),
  revision integer NOT NULL DEFAULT 0 CHECK(revision BETWEEN 0 AND 2147483646),
  participation_purpose text GENERATED ALWAYS AS ('study_participation'::text) STORED,
  participation_version text NOT NULL,
  secondary_purpose text GENERATED ALWAYS AS ('secondary_research'::text) STORED,
  secondary_version text NOT NULL,
  FOREIGN KEY(participation_purpose,participation_version) REFERENCES consent_documents(purpose,version),
  FOREIGN KEY(secondary_purpose,secondary_version) REFERENCES consent_documents(purpose,version)
);
CREATE INDEX study_consent_participation_document ON study_consent_policies(participation_purpose,participation_version);
CREATE INDEX study_consent_secondary_document ON study_consent_policies(secondary_purpose,secondary_version);
CREATE FUNCTION guard_consent_policy() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,pedpsy AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'consent policy identity frozen' USING ERRCODE='23514';END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.revision<>0 THEN RAISE EXCEPTION 'consent policy initial revision invalid' USING ERRCODE='23514';END IF;
  ELSIF NEW.study_id IS DISTINCT FROM OLD.study_id OR NEW.revision<>OLD.revision+1
    OR (NEW.participation_version,NEW.secondary_version) IS NOT DISTINCT FROM (OLD.participation_version,OLD.secondary_version) THEN
    RAISE EXCEPTION 'consent policy revision invalid' USING ERRCODE='23514';
  END IF;RETURN NEW;
END $$;
CREATE TRIGGER consent_policy_guard BEFORE INSERT OR UPDATE OR DELETE ON study_consent_policies FOR EACH ROW EXECUTE FUNCTION guard_consent_policy();
INSERT INTO study_consent_policies(study_id,participation_version,secondary_version)
  SELECT id,'demo-participation-1','demo-secondary-1' FROM studies;
CREATE FUNCTION default_study_consent_policy() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,pedpsy AS $$
BEGIN
  INSERT INTO pedpsy.study_consent_policies(study_id,participation_version,secondary_version)
    VALUES(NEW.id,'demo-participation-1','demo-secondary-1');RETURN NEW;
END $$;
CREATE TRIGGER study_consent_policy_default AFTER INSERT ON studies FOR EACH ROW EXECUTE FUNCTION default_study_consent_policy();
CREATE TABLE participant_consent_acceptances(
  study_id uuid NOT NULL,participant_id uuid NOT NULL,
  purpose text NOT NULL,document_version text NOT NULL,
  credential_id uuid NOT NULL,accepted_at_ms bigint NOT NULL CHECK(accepted_at_ms>=0),
  PRIMARY KEY(study_id,participant_id,purpose,document_version),
  FOREIGN KEY(study_id,participant_id) REFERENCES participant_group_bindings(study_id,participant_id),
  FOREIGN KEY(purpose,document_version) REFERENCES consent_documents(purpose,version),
  FOREIGN KEY(credential_id,study_id,participant_id) REFERENCES participant_credentials(id,study_id,participant_id)
);
CREATE INDEX participant_consent_document ON participant_consent_acceptances(purpose,document_version);
CREATE INDEX participant_consent_credential ON participant_consent_acceptances(credential_id,study_id,participant_id);
CREATE TRIGGER participant_consent_immutable BEFORE UPDATE OR DELETE ON participant_consent_acceptances FOR EACH ROW EXECUTE FUNCTION immutable_row();
ALTER TABLE consent_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_consent_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE participant_consent_acceptances ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON consent_documents,study_consent_policies,participant_consent_acceptances FROM PUBLIC;

CREATE FUNCTION lock_own_consent_scope() RETURNS TABLE(owner_study uuid,owner_participant uuid,policy_revision integer,participation_version text,secondary_version text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
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
    IF document.legal_status<>'synthetic_only' THEN RAISE EXCEPTION 'NOT_AVAILABLE' USING ERRCODE='P0002';END IF;
    document_count:=document_count+1;
  END LOOP;
  PERFORM pedpsy.assert_own_passport_session();
  IF document_count<>2 THEN RAISE EXCEPTION 'NOT_AVAILABLE' USING ERRCODE='P0002';END IF;
  RETURN QUERY SELECT scope.owner_study,scope.owner_participant,policy.revision,policy.participation_version,policy.secondary_version;
END $$;
CREATE FUNCTION own_consents_snapshot(study uuid,participant uuid,policy_revision integer,participation_version text,secondary_version text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE contact_document record;participation_document record;secondary_document record;contact_at bigint;participation_at bigint;secondary_at bigint;
BEGIN
  SELECT n.version,n.body AS text INTO contact_document FROM pedpsy.study_contact_policies p
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
      jsonb_build_object('purpose','contact_processing','version',contact_document.version,'text',contact_document.text,'legal_status','synthetic_only',
        'required',true,'accepted_at_ms',contact_at,'provenance','contact_notice_confirmation'),
      jsonb_build_object('purpose','study_participation','version',participation_version,'text',participation_document.body_text,'legal_status','synthetic_only',
        'required',true,'accepted_at_ms',participation_at,'provenance','explicit_participant_acceptance'),
      jsonb_build_object('purpose','secondary_research','version',secondary_version,'text',secondary_document.body_text,'legal_status','synthetic_only',
        'required',false,'accepted_at_ms',secondary_at,'provenance','explicit_participant_acceptance')));
END $$;
CREATE FUNCTION own_consents_audit(action_code text,participant uuid,record_count integer) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE actor record;
BEGIN
  IF action_code IS NULL OR action_code NOT IN ('participants.consents.read','participants.consents.accept') OR record_count IS NULL OR record_count NOT BETWEEN 0 AND 2 THEN RAISE EXCEPTION 'INVALID_AUDIT_ACTION';END IF;
  PERFORM pedpsy.assert_own_passport_session();SELECT * INTO actor FROM pedpsy.session_actor() WHERE actor_role='participant';
  IF actor.participant_id IS DISTINCT FROM participant THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='28000';END IF;
  INSERT INTO pedpsy.access_audit_events(id,at_ms,credential_id,study_id,action,outcome,reason,resource_id,record_count)
    VALUES(gen_random_uuid(),floor(extract(epoch FROM clock_timestamp())*1000)::bigint,actor.credential_id,actor.study_id,action_code,'allow','OWN_SCOPE',participant,record_count);
  PERFORM pedpsy.assert_own_passport_session();PERFORM pedpsy.touch_session();
END $$;
CREATE FUNCTION read_own_consents() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE scope record;record_count integer;
BEGIN
  SELECT * INTO scope FROM pedpsy.lock_own_consent_scope();
  PERFORM 1 FROM pedpsy.participant_consent_acceptances a WHERE a.study_id=scope.owner_study AND a.participant_id=scope.owner_participant ORDER BY a.purpose,a.document_version FOR SHARE;
  PERFORM pedpsy.assert_own_passport_session();
  SELECT count(*)::integer INTO record_count FROM pedpsy.participant_consent_acceptances a
    WHERE a.study_id=scope.owner_study AND a.participant_id=scope.owner_participant
      AND ((a.purpose='study_participation' AND a.document_version=scope.participation_version)
        OR (a.purpose='secondary_research' AND a.document_version=scope.secondary_version));
  PERFORM pedpsy.own_consents_audit('participants.consents.read',scope.owner_participant,record_count);
  RETURN pedpsy.own_consents_snapshot(scope.owner_study,scope.owner_participant,scope.policy_revision,scope.participation_version,scope.secondary_version);
END $$;
CREATE FUNCTION accept_own_consent(target_purpose text,target_version text,expected_policy_revision integer,approved boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE scope record;actor record;
BEGIN
  SELECT * INTO scope FROM pedpsy.lock_own_consent_scope();
  IF target_purpose IS NULL OR target_purpose NOT IN ('study_participation','secondary_research') OR target_version IS NULL
    OR target_version !~ '^[a-z][a-z0-9_-]{0,63}$' OR expected_policy_revision IS NULL OR expected_policy_revision NOT BETWEEN 0 AND 2147483646
    OR approved IS DISTINCT FROM true THEN RAISE EXCEPTION 'INVALID_CONSENT_INPUT' USING ERRCODE='22023';END IF;
  IF expected_policy_revision<>scope.policy_revision OR target_version IS DISTINCT FROM
    (CASE WHEN target_purpose='study_participation' THEN scope.participation_version ELSE scope.secondary_version END) THEN
    RAISE EXCEPTION 'PARTICIPATION_REQUIREMENTS_CHANGED' USING ERRCODE='P0001';END IF;
  PERFORM 1 FROM pedpsy.participant_consent_acceptances a WHERE a.study_id=scope.owner_study AND a.participant_id=scope.owner_participant
    AND a.purpose=target_purpose ORDER BY a.document_version FOR UPDATE;
  PERFORM pedpsy.assert_own_passport_session();SELECT * INTO actor FROM pedpsy.session_actor() WHERE actor_role='participant';
  INSERT INTO pedpsy.participant_consent_acceptances(study_id,participant_id,purpose,document_version,credential_id,accepted_at_ms)
    VALUES(scope.owner_study,scope.owner_participant,target_purpose,target_version,actor.credential_id,floor(extract(epoch FROM clock_timestamp())*1000)::bigint)
    ON CONFLICT(study_id,participant_id,purpose,document_version) DO NOTHING;
  PERFORM pedpsy.own_consents_audit('participants.consents.accept',scope.owner_participant,1);
  RETURN pedpsy.own_consents_snapshot(scope.owner_study,scope.owner_participant,scope.policy_revision,scope.participation_version,scope.secondary_version);
END $$;
REVOKE ALL ON FUNCTION guard_consent_policy(),default_study_consent_policy(),lock_own_consent_scope(),own_consents_snapshot(uuid,uuid,integer,text,text),own_consents_audit(text,uuid,integer),read_own_consents(),accept_own_consent(text,text,integer,boolean) FROM PUBLIC;
