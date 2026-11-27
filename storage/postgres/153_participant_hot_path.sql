SET LOCAL search_path=pedpsy,pg_catalog;
-- 153: the participant hot path paid the actor lookup on every call, and that call
-- was expensive: the SQL body was re-planned each time (catalog work dominated the
-- 10-11 ms measured per call, while executing it costs ~1 ms). One draft save calls
-- it dozens of times through the RLS chain, so the page waited seconds for work that
-- only had to be done once.
--
-- Keep the same predicate, the same SECURITY DEFINER boundary and the same grants;
-- only the shape changes so that the plan is prepared once per session and reused:
--   * the session hash and the current time are read once into variables,
--   * the body is parameterised plpgsql instead of a SQL body with current_setting
--     and clock_timestamp() inline,
--   * both actor branches keep UNION ALL semantics (two returns, same filters).

CREATE OR REPLACE FUNCTION pedpsy.session_actor()
RETURNS TABLE(credential_id uuid, study_id uuid, participant_id uuid, actor_role text, credential_version integer, expires_at_ms bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE h text; now_ms numeric;
BEGIN
  h := current_setting('app.session_hash',true);
  IF h IS NULL OR h='' THEN RETURN;END IF;
  now_ms := extract(epoch FROM clock_timestamp())*1000;
  RETURN QUERY
    SELECT c.id,c.study_id,c.participant_id,'participant'::text,c.version,s.expires_at_ms
      FROM pedpsy.participant_sessions s
      JOIN pedpsy.participant_credentials c ON (c.id,c.study_id,c.participant_id)=(s.credential_id,s.study_id,s.participant_id)
      JOIN pedpsy.participants p ON (p.study_id,p.id)=(c.study_id,c.participant_id)
      JOIN pedpsy.studies r ON r.id=c.study_id
     WHERE s.token_hash=h AND s.revoked_at_ms IS NULL AND s.credential_version=c.version
       AND c.status='active' AND p.status='active' AND r.status='active' AND r.dataset_kind='demo'
       AND now_ms>=s.last_seen_at_ms AND now_ms<s.expires_at_ms AND now_ms-s.last_seen_at_ms<600000;
  RETURN QUERY
    SELECT c.id,NULL::uuid,NULL::uuid,c.role,c.version,s.expires_at_ms
      FROM pedpsy.staff_sessions s
      JOIN pedpsy.staff_credentials c ON (c.id,c.user_id,c.role)=(s.credential_id,s.user_id,s.role)
      JOIN pedpsy.users u ON u.id=c.user_id
     WHERE s.token_hash=h AND s.revoked_at_ms IS NULL AND s.credential_version=c.version
       AND c.status='active' AND u.status='active' AND s.mfa_verified_at IS NOT NULL AND s.mfa_verified_at<=clock_timestamp()
       AND now_ms>=s.last_seen_at_ms AND now_ms<s.expires_at_ms AND now_ms-s.last_seen_at_ms<600000;
END $$;

-- Second multiplier: the RLS predicate can_read_attempt() -> owns_active_attempt()
-- runs the whole admission check on every evaluation (attempt read, CAS update,
-- response rows), and that check locks stage requirements and walks assignments.
-- Remember an *allowed* verdict for the rest of the transaction; the first
-- evaluation still runs the original function with its locks and its errors.
-- Only "allowed" is remembered: a denial is recomputed, because enroll_own_stage
-- and accept_own_consent can make the same participant admissible inside one
-- transaction, and a cached denial would then hide the new permission.
CREATE OR REPLACE FUNCTION pedpsy.current_admission_allows_cached(
  target_study uuid, target_participant uuid, target_enrollment uuid,
  target_group uuid, target_stage uuid, target_release uuid
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE slot text; hit text; verdict boolean;
BEGIN
  slot := 'app.admission_' || md5(concat_ws('|',target_study,target_participant,target_enrollment,target_group,target_stage,target_release));
  hit := current_setting(slot,true);
  IF hit='1' THEN RETURN true;END IF;
  verdict := pedpsy.current_admission_allows(target_study,target_participant,target_enrollment,target_group,target_stage,target_release);
  IF verdict THEN PERFORM set_config(slot,'1',true);END IF;
  RETURN verdict;
END $$;
REVOKE ALL ON FUNCTION pedpsy.current_admission_allows_cached(uuid,uuid,uuid,uuid,uuid,uuid) FROM PUBLIC;

DO $$
DECLARE d text;
BEGIN
  SELECT pg_get_functiondef('pedpsy.owns_active_attempt(uuid)'::regprocedure) INTO d;
  IF d IS NULL THEN RAISE EXCEPTION 'OWNS_ACTIVE_ATTEMPT_MISSING';END IF;
  IF d LIKE '%current_admission_allows_cached(%' THEN RETURN;END IF;
  IF d NOT LIKE '%pedpsy.current_admission_allows(%' THEN RAISE EXCEPTION 'ADMISSION_CALL_NOT_FOUND';END IF;
  d:=replace(d,'pedpsy.current_admission_allows(','pedpsy.current_admission_allows_cached(');
  EXECUTE d;
END $$;
