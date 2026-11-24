SET LOCAL search_path=pedpsy,pg_catalog;
-- 128: the attempt-completion trigger performs an internal integrity count over
-- responses. Running it as the invoking participant made that count traverse
-- row-level security (and the admission chain) once per answer; on ECV-15 the
-- final UPDATE attempts could exceed statement_timeout. The trigger is internal
-- integrity logic, so it runs as its owner with a fixed search_path.
ALTER FUNCTION pedpsy.guard_attempt() SECURITY DEFINER;
