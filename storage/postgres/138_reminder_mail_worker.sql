SET LOCAL search_path=pedpsy,pg_catalog;
-- 138: reminder delivery state and narrow runtime functions for the mail worker.
-- The immutable reminder outbox stays untouched; delivery is recorded separately.
CREATE TABLE pedpsy.research_reminder_deliveries(
  study_id uuid NOT NULL,
  request_id uuid NOT NULL,
  participant_id uuid NOT NULL,
  stage_id uuid NOT NULL,
  sent_at_ms bigint NOT NULL,
  PRIMARY KEY(study_id,request_id,participant_id),
  FOREIGN KEY(study_id,request_id) REFERENCES pedpsy.research_reminder_batches(study_id,request_id)
);
CREATE TRIGGER research_reminder_delivery_immutable BEFORE UPDATE OR DELETE
  ON pedpsy.research_reminder_deliveries FOR EACH ROW EXECUTE FUNCTION pedpsy.immutable_row();

CREATE FUNCTION pedpsy.read_pending_research_reminders(batch_size integer)
RETURNS TABLE(study_id uuid,request_id uuid,participant_id uuid,stage_id uuid,email text,message text,created_at_ms bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
BEGIN
  IF batch_size IS NULL OR batch_size<1 OR batch_size>50 THEN RAISE EXCEPTION 'INVALID_DELIVERY_BATCH' USING ERRCODE='22023';END IF;
  RETURN QUERY
    SELECT o.study_id,o.request_id,o.participant_id,o.stage_id,o.email,o.message,o.created_at_ms
    FROM pedpsy.research_reminder_outbox o
    LEFT JOIN pedpsy.research_reminder_deliveries d
      ON (d.study_id,d.request_id,d.participant_id)=(o.study_id,o.request_id,o.participant_id)
    WHERE d.participant_id IS NULL
    ORDER BY o.created_at_ms,o.study_id,o.request_id,o.participant_id
    LIMIT batch_size;
END $$;

CREATE FUNCTION pedpsy.mark_research_reminder_sent(
  target_study uuid,target_request uuid,target_participant uuid,target_stage uuid,sent_at bigint)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
BEGIN
  INSERT INTO pedpsy.research_reminder_deliveries(study_id,request_id,participant_id,stage_id,sent_at_ms)
  VALUES(target_study,target_request,target_participant,target_stage,sent_at)
  ON CONFLICT DO NOTHING;
  RETURN FOUND;
END $$;

REVOKE ALL ON TABLE pedpsy.research_reminder_deliveries FROM PUBLIC;
REVOKE ALL ON FUNCTION pedpsy.read_pending_research_reminders(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION pedpsy.mark_research_reminder_sent(uuid,uuid,uuid,uuid,bigint) FROM PUBLIC;
