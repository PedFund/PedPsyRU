SET LOCAL search_path=pedpsy,pg_catalog;
-- Branding is versioned. Previously accepted immutable synthetic notices and
-- consents remain byte-for-byte historical records.
INSERT INTO contact_notices(version,body,legal_status) VALUES(
 'demo-contact-2',
 'Учебный контур «МетодТест». Используйте только вымышленные адреса @example.test и вымышленные данные. Настоящие письма не отправляются. Это тестовый текст для проверки интерфейса, не утверждённые юридические условия.',
 'synthetic_only'
);
INSERT INTO consent_documents(purpose,version,body_text) VALUES(
 'study_participation',
 'demo-participation-2',
 'Учебное участие в вымышленном исследовании платформы «МетодТест». Только синтетические данные. Это текст для проверки явного принятия условий, не утверждённый юридический документ. Принятие не означает согласия на последующее научное использование. Обращения к оператору рассматриваются отдельно; учебный интерфейс не ограничивает законные права.'
);
UPDATE study_contact_policies SET notice_version='demo-contact-2' WHERE notice_version='demo-contact-1';
UPDATE study_consent_policies SET revision=revision+1,participation_version='demo-participation-2' WHERE participation_version='demo-participation-1';
CREATE OR REPLACE FUNCTION initialize_study_contact_policy() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
BEGIN INSERT INTO pedpsy.study_contact_policies(study_id,notice_version) VALUES(NEW.id,'demo-contact-2');RETURN NEW;END $$;
CREATE OR REPLACE FUNCTION default_study_consent_policy() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
BEGIN INSERT INTO pedpsy.study_consent_policies(study_id,participation_version,secondary_version) VALUES(NEW.id,'demo-participation-2','demo-secondary-1');RETURN NEW;END $$;
REVOKE ALL ON FUNCTION initialize_study_contact_policy(),default_study_consent_policy() FROM PUBLIC;
