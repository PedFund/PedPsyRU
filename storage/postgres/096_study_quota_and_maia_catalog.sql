SET LOCAL search_path=pedpsy,pg_catalog;
-- 096: the pilot limited every researcher to one active study, which blocked the owner's
-- testing. The owner's decision (2026-11-19) is five active studies per researcher; the
-- check itself stays in place. Existing credentials below five are raised, never lowered.
ALTER TABLE researcher_credentials ALTER COLUMN active_study_quota SET DEFAULT 5;
UPDATE researcher_credentials SET active_study_quota=5 WHERE active_study_quota<5;
-- The first import of the MAIA-R release took its author from the service citation and
-- kept the key slugs as indicator names. Correct the catalog row to the package author
-- and the Russian subscale labels; the release, key and form stay untouched.
UPDATE method_library_catalog c SET
  authors=jsonb_build_array('Попова Резеда Равилевна, Лопухова Ольга Геннадьевна'),
  indicators='["Наблюдение","Не отвлечение внимания от боли","Отсутствие беспокойства","Регуляция внимания","Осознавание негативного эмоционального состояния","Осознавание позитивного эмоционального состояния","Саморегуляция на основе активного «слушания» тела","Доверие"]'::jsonb
WHERE c.method_id='maia_r_32';
