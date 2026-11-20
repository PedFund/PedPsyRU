SET LOCAL search_path=pedpsy,pg_catalog;
-- 103: participant login by e-mail without an invitation link. The address resolves
-- to a study only when it belongs to exactly one active participant contact; several
-- matches raise AMBIGUOUS_PARTICIPANT_STUDY so the caller asks for the group link.
CREATE FUNCTION participant_login_study(email text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE ids uuid[];
BEGIN
  IF email IS NULL OR length(email) NOT BETWEEN 3 AND 320 THEN RETURN NULL;END IF;
  SELECT array_agg(DISTINCT c.study_id) INTO ids
  FROM pedpsy.participant_contacts c
  JOIN pedpsy.participants p ON (p.study_id,p.id)=(c.study_id,c.participant_id) AND p.status='active'
  JOIN pedpsy.studies s ON s.id=c.study_id AND s.status='active'
  WHERE c.status='active' AND c.email_key=lower(btrim(email));
  IF ids IS NULL THEN RETURN NULL;END IF;
  IF array_length(ids,1)>1 THEN RAISE EXCEPTION 'AMBIGUOUS_PARTICIPANT_STUDY' USING ERRCODE='P0001';END IF;
  RETURN ids[1];
END $$;
REVOKE ALL ON FUNCTION participant_login_study(text) FROM PUBLIC;
