SET LOCAL search_path=pedpsy,pg_catalog;
-- Additional public metadata for a permanent study-scoped return path, never
-- client authority. No identity/session/proof consumption on a GET.
CREATE FUNCTION registration_context(digest text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE x record;data jsonb;
BEGIN
  SELECT * INTO x FROM pedpsy.lock_registration_invite(digest);
  data:=jsonb_build_object('study_id',x.study_id,'study_title',x.study_title,'group_name',x.group_name,
    'contact_notice',jsonb_build_object('version',x.notice_version,'text',x.notice_text,'legal_status','synthetic_only'));
  IF length(x.study_title)>200 OR length(x.group_name)>100 OR octet_length(data::text)>65536 THEN RAISE EXCEPTION 'REGISTRATION_LIMIT' USING ERRCODE='54000';END IF;
  PERFORM pedpsy.registration_audit('participants.registration.context',x.study_id,x.invitation_id);RETURN data;
END $$;
CREATE INDEX registration_receipt_pending ON registration_pending(invitation_id,browser_hash,created_at_ms DESC,id) WHERE status='pending';
-- Private helper. Caller holds the same registration advisory lock used by
-- reserve/queue/confirm; parent -> pending -> outbox locks have a fixed order.
CREATE FUNCTION lock_registration_receipt(digest text,browser text,delivery uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE x record;p record;o record;at_ms bigint;invite_expiry bigint;
BEGIN
  IF browser IS NULL OR browser !~ '^sha256:[a-f0-9]{64}$' OR browser=digest THEN RETURN jsonb_build_object('status','not_available');END IF;
  BEGIN SELECT * INTO x FROM pedpsy.lock_registration_invite(digest);
  EXCEPTION WHEN SQLSTATE 'P0002' THEN RETURN jsonb_build_object('status','not_available');END;
  SELECT * INTO p FROM pedpsy.registration_pending q WHERE q.invitation_id=x.invitation_id AND q.browser_hash=browser AND q.status='pending'
    AND (delivery IS NULL OR q.id=(SELECT z.pending_id FROM pedpsy.contact_confirmation_outbox z WHERE z.id=delivery))
    ORDER BY q.created_at_ms DESC,q.id LIMIT 1 FOR UPDATE;
  IF p.id IS NULL THEN RETURN jsonb_build_object('status','not_available');END IF;
  SELECT * INTO o FROM pedpsy.contact_confirmation_outbox q WHERE q.pending_id=p.id FOR UPDATE;
  -- Time is deliberately read after both row-lock waits. Parent expiry was
  -- checked by the helper before pending/outbox waits and must be rechecked.
  at_ms:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
  SELECT expires_at_ms INTO invite_expiry FROM pedpsy.group_invitations q WHERE q.id=x.invitation_id;
  IF o.id IS NULL OR p.status<>'pending' OR p.attempts_remaining<=0 OR o.status NOT IN ('ready','sent') OR o.purpose<>'email_confirmation'
    OR p.expires_at_ms<=at_ms OR o.expires_at_ms<=at_ms OR invite_expiry<=at_ms OR o.recipient IS DISTINCT FROM p.email_key
    OR o.recipient !~ '@example[.]test$' OR (delivery IS NOT NULL AND o.id<>delivery)
    OR (p.study_id,p.group_id,p.invitation_id,p.invitation_revision) IS DISTINCT FROM (x.study_id,x.group_id,x.invitation_id,x.invitation_revision)
    THEN RETURN jsonb_build_object('status','not_available');END IF;
  IF p.contact_notice_version IS DISTINCT FROM x.notice_version THEN RETURN jsonb_build_object('status','requirements_changed');END IF;
  RETURN jsonb_build_object('status','material','study_id',p.study_id,'pending_id',p.id,'delivery_id',o.id,
    'token_envelope',o.token_envelope,'confirmation_hash',p.confirmation_hash,'expires_at',least(p.expires_at_ms,o.expires_at_ms,invite_expiry));
END $$;
CREATE FUNCTION registration_receipt_material(digest text,browser text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE at_ms bigint;bucket text;window_ms bigint;limit_n integer;throttle record;data jsonb;
BEGIN
  PERFORM pg_advisory_xact_lock(5151980006);at_ms:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
  IF digest IS NULL OR digest !~ '^sha256:[a-f0-9]{64}$' OR browser IS NULL OR browser !~ '^sha256:[a-f0-9]{64}$' OR browser=digest THEN
    PERFORM pedpsy.registration_audit('participants.registration.receipt_denied',NULL,NULL,false);RETURN jsonb_build_object('status','not_available');END IF;
  -- Count syntactically valid requests even for unavailable invitations, so
  -- denial does not roll back persistent admission. No raw email in buckets.
  FOR bucket,window_ms,limit_n IN SELECT 'global',300000::bigint,100 UNION ALL SELECT 'browser:'||browser,900000::bigint,10 LOOP
    bucket:='sha256:'||encode(sha256(convert_to('pedpsy-registration-receipt:'||bucket,'UTF8')),'hex');
    SELECT * INTO throttle FROM pedpsy.login_throttles q WHERE q.bucket_hash=bucket FOR UPDATE;
    IF FOUND AND at_ms-throttle.window_start_ms<window_ms AND throttle.count>=limit_n THEN
      PERFORM pedpsy.registration_audit('participants.registration.receipt_throttled',NULL,NULL,false);RETURN jsonb_build_object('status','throttled');END IF;
    INSERT INTO pedpsy.login_throttles(bucket_hash,window_start_ms,count) VALUES(bucket,at_ms,1)
      ON CONFLICT(bucket_hash) DO UPDATE SET window_start_ms=CASE WHEN at_ms-login_throttles.window_start_ms>=window_ms THEN at_ms ELSE login_throttles.window_start_ms END,
      count=CASE WHEN at_ms-login_throttles.window_start_ms>=window_ms THEN 1 ELSE login_throttles.count+1 END;
  END LOOP;
  data:=pedpsy.lock_registration_receipt(digest,browser);
  PERFORM pedpsy.registration_audit('participants.registration.receipt_read',(data->>'study_id')::uuid,(data->>'pending_id')::uuid,data->>'status'='material');
  -- Internal encrypted material only, never an HTTP DTO or mailbox list.
  RETURN data-'study_id'-'pending_id';
END $$;
CREATE FUNCTION finish_registration_receipt(digest text,browser text,delivery uuid,confirmation text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE data jsonb;
BEGIN
  PERFORM pg_advisory_xact_lock(5151980006);
  IF delivery IS NULL OR confirmation IS NULL OR confirmation !~ '^sha256:[a-f0-9]{64}$' OR confirmation IN (digest,browser) THEN
    PERFORM pedpsy.registration_audit('participants.registration.receipt_denied',NULL,NULL,false);RETURN 'not_available';END IF;
  data:=pedpsy.lock_registration_receipt(digest,browser,delivery);
  IF data->>'status'<>'material' OR data->>'confirmation_hash' IS DISTINCT FROM confirmation THEN
    PERFORM pedpsy.registration_audit('participants.registration.receipt_denied',NULL,NULL,false);
    RETURN CASE WHEN data->>'status'='requirements_changed' THEN 'requirements_changed' ELSE 'not_available' END;
  END IF;
  -- One transition only. Retrying a lost test response can return the same
  -- valid code without rewriting an already-sent row or granting a session.
  UPDATE pedpsy.contact_confirmation_outbox q SET status='sent',sent_at_ms=floor(extract(epoch FROM clock_timestamp())*1000)::bigint
    WHERE q.id=delivery AND q.status='ready';
  PERFORM pedpsy.registration_audit('participants.registration.receipt_delivered',(data->>'study_id')::uuid,(data->>'pending_id')::uuid);
  RETURN 'delivered';
END $$;
REVOKE ALL ON FUNCTION registration_context(text),lock_registration_receipt(text,text,uuid),registration_receipt_material(text,text),finish_registration_receipt(text,text,uuid,text) FROM PUBLIC;
