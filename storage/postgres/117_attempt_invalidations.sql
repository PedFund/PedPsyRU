SET LOCAL search_path=pedpsy,pg_catalog;
-- 117: invalid results stay in history and are marked as not usable. The mark is
-- append-only; no attempt, response or stored result is rewritten.
CREATE TABLE IF NOT EXISTS attempt_invalidations(
  attempt_id uuid PRIMARY KEY REFERENCES attempts(id),
  reason text NOT NULL CHECK(reason ~ '^[a-z0-9_]{3,80}$'),
  created_at_ms bigint NOT NULL CHECK(created_at_ms>=0)
);
CREATE TRIGGER attempt_invalidations_immutable BEFORE UPDATE OR DELETE ON attempt_invalidations
  FOR EACH ROW EXECUTE FUNCTION immutable_row();
REVOKE ALL ON attempt_invalidations FROM PUBLIC;

CREATE OR REPLACE FUNCTION invalidate_attempt(target uuid, reason text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE actor record;at bigint;
BEGIN
  SELECT * INTO actor FROM pedpsy.account_actor();
  IF actor.actor_role NOT IN ('administrator','superadministrator') THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='42501';END IF;
  IF target IS NULL OR reason IS NULL THEN RAISE EXCEPTION 'INVALID_INPUT' USING ERRCODE='22023';END IF;
  IF NOT EXISTS(SELECT 1 FROM pedpsy.attempts WHERE id=target AND status='completed') THEN RAISE EXCEPTION 'NOT_AVAILABLE' USING ERRCODE='P0002';END IF;
  at:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
  INSERT INTO attempt_invalidations(attempt_id,reason,created_at_ms) VALUES(target,reason,at) ON CONFLICT(attempt_id) DO NOTHING;
  PERFORM pedpsy.constructor_audit('attempts.invalidated',target);
END $$;
REVOKE ALL ON FUNCTION invalidate_attempt(uuid,text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION attempt_invalidated(target uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
  SELECT pedpsy.can_read_attempt(target) AND EXISTS(SELECT 1 FROM pedpsy.attempt_invalidations i WHERE i.attempt_id=target)
$$;
REVOKE ALL ON FUNCTION attempt_invalidated(uuid) FROM PUBLIC;
