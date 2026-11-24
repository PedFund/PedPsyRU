SET LOCAL search_path=pedpsy,pg_catalog;
-- 133: owner-provided informed consent for study participation. The legal
-- status records only that the operator supplied the text; it is not an
-- assertion of independent legal approval. Existing document versions and
-- accepted consents remain immutable.
ALTER TABLE pedpsy.consent_documents DROP CONSTRAINT IF EXISTS consent_documents_legal_status_check;
ALTER TABLE pedpsy.consent_documents ADD CONSTRAINT consent_documents_legal_status_check
  CHECK(legal_status IN ('synthetic_only','owner_provided'));

INSERT INTO pedpsy.consent_documents(purpose,version,body_text,legal_status)
VALUES (
  'study_participation',
  'informed-consent-2026-11-24',
  regexp_replace($body$
Информированное добровольное согласие на участие в научном исследовании

1. Общие положения

На цифровой платформе «МетодТест» проводятся научные исследования, направленные на изучение психологических, педагогических и социальных явлений, процессов и индивидуальных особенностей человека.

К участию в исследованиях допускаются лица, достигшие 18 лет.

2. Содержание участия

Участие в исследовании может включать заполнение анкет и опросников, прохождение тестов и диагностических методик, выполнение исследовательских заданий.

Информация о целях, содержании и условиях участия предоставляется исследователем до начала соответствующего исследования.

3. Добровольность участия

Участие в исследовании является добровольным.

Участник вправе отказаться от участия или прекратить его в любой момент без объяснения причин и негативных последствий.

4. Возможные риски и ограничения

Исследования не направлены на постановку медицинских диагнозов, лечение или оказание психотерапевтической помощи.

Участие в исследовании не гарантирует получения конкретных результатов или прямой индивидуальной пользы.

5. Конфиденциальность и использование результатов

Индивидуальные данные и результаты исследования являются конфиденциальными.

Результаты могут использоваться в научных публикациях, диссертациях, докладах и исследовательских отчетах в форме, не позволяющей идентифицировать участника.

Обработка персональных данных осуществляется на основании отдельного согласия.

6. Подтверждение согласия

Подтверждение настоящего согласия в электронной форме означает ознакомление с условиями участия, подтверждение достижения совершеннолетнего возраста и добровольное согласие на участие в соответствующем научном исследовании.
$body$, '\s+', ' ', 'g'),
  'owner_provided'
)
ON CONFLICT (purpose,version) DO NOTHING;

CREATE OR REPLACE FUNCTION pedpsy.default_study_consent_policy() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,pedpsy AS $$
BEGIN
  INSERT INTO pedpsy.study_consent_policies(study_id,participation_version,secondary_version)
    VALUES(NEW.id,'informed-consent-2026-11-24','demo-secondary-1');
  RETURN NEW;
END $$;
