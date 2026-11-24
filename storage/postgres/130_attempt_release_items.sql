SET LOCAL search_path=pedpsy,pg_catalog;
-- 130: read the pinned items of an attempt's release after one authorization
-- check. Previously the participant form query evaluated can_read_release for
-- every release_items row, which made the first form load after a restart
-- several seconds long. The function still requires access to the attempt.
CREATE FUNCTION pedpsy.read_attempt_release_items(attempt uuid, release uuid)
RETURNS TABLE(item_id text, ordinal integer, options jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
  SELECT i.item_id,i.ordinal,i.options
  FROM pedpsy.release_items i
  WHERE i.release_id=release
    AND EXISTS(
      SELECT 1 FROM pedpsy.attempts a
      WHERE a.id=attempt AND a.release_id=release AND pedpsy.can_read_attempt(a.id))
  ORDER BY i.ordinal
$$;
REVOKE ALL ON FUNCTION pedpsy.read_attempt_release_items(uuid,uuid) FROM PUBLIC;
