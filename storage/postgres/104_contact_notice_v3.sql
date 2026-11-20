SET LOCAL search_path=pedpsy,pg_catalog;
-- 104: the contact notice no longer claims that real letters are not sent and no longer
-- asks for @example.test addresses: real mail is enabled. The version is new and the
-- historical notices stay immutable; new studies get the current version.
INSERT INTO contact_notices(version,body,legal_status) VALUES(
 'demo-contact-3',
 'Учебный контур «МетодТест». Это тестовый текст для проверки интерфейса, не утверждённые юридические условия. Данные используются только для участия в учебном исследовании.',
 'synthetic_only'
);
UPDATE study_contact_policies SET notice_version='demo-contact-3' WHERE notice_version<>'demo-contact-3';
CREATE OR REPLACE FUNCTION initialize_study_contact_policy() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
BEGIN INSERT INTO pedpsy.study_contact_policies(study_id,notice_version) VALUES(NEW.id,'demo-contact-3');RETURN NEW;END $$;
REVOKE ALL ON FUNCTION initialize_study_contact_policy() FROM PUBLIC;
