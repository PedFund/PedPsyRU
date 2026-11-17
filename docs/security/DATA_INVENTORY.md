# Инвентаризация персональных данных МетодТест

Дата: 2026-11-17. Основание: 152-ФЗ (ст. 18.1, 19), ПП РФ № 1119. База: `main` `3f8c843`.
Метод: схема БД, полученная применением всех append-only миграций на синтетической PostgreSQL 18, плюс чтение кода и функций. Реальные данные не использовались и в документ не попадали.

## 1. Границы и профиль

- Коммерческая (не государственная) ИСПДн, развёрнута в Selectel; PostgreSQL 18 + Node/TypeScript.
- Категория ПДн — **иные** (данные о здоровье не обрабатываются; результаты психологических шкал не относим к специальной категории).
- Субъекты — участники-физлица, не сотрудники оператора; количество < 100 000.
- Субъекты младше 18 лет по решению владельца не обрабатываются (см. раздел 11 — технически это пока не обеспечено глобально).
- Биометрия, общедоступные источники, ГИС, КИИ — не применяются.

## 2. Где лежат ПДн

### 2.1 Идентификация и контакт

| Поле | Где | Назначение | Копии |
|---|---|---|---|
| `email_key` | `pedpsy.participant_contacts` (`023_participant_contact_identity.sql:14`) | логин и единственный контакт участника, в открытом виде (не хэш) | дублируется в `registration_pending.email_key`, `contact_confirmation_outbox.recipient`, `research_reminder_outbox.email` |
| `display_code` | `pedpsy.participants` (`001_domain.sql:56`) | псевдонимный код участника для исследователя | попадает в экспорт staff и в панель «Ход исследования» |
| `status`, `confirmed_at_ms` | `participant_contacts` | активность контакта, момент подтверждения | — |

ФИО, телефона, адреса проживания и паспортных данных в схеме **нет** — это подтверждается перечнем полей таблиц `participants`, `participant_contacts`, `participant_group_bindings`.

### 2.2 Учётные данные и сессии

| Поле | Где | Назначение | Особенность |
|---|---|---|---|
| `salt`, `password_hash` | `participant_credentials` (`002_access_rls.sql:2`), `researcher_credentials`, `staff_credentials` | проверка пароля | пароль в открытом виде не хранится |
| `token_hash` | `participant_sessions` (`002_access_rls.sql:9`), `researcher_sessions`, `staff_sessions` | сессии | хранится только хэш токена |
| `token_hash` | `group_invitations`, `researcher_invites` | приглашения | хранится только хэш |
| `bucket_hash` | `login_throttles` (`002_access_rls.sql:31`) | троттлинг логинов | псевдонимный ключ, исходный email не хранится |
| `scheme`, `version`, `expires_at_ms`, `revoked_at_ms` | сессии и креды | срок жизни, отзыв | — |

### 2.3 Демографический паспорт участника

| Поле | Где | Назначение |
|---|---|---|
| `answers` (jsonb) | `participant_passports` (`027_participant_passports.sql:31`) | текущая анкета: `sex`, `age`, `city`, `organization`, `education` + до 5 дополнительных полей исследования |
| `fields`, `answers` | `research_profile_drafts` (`031_research_workbench.sql:10`) | черновик анкеты |
| `fields`, `answers` | `research_profile_history` (`031_research_workbench.sql:11`), неизменяемая | история версий анкеты |
| `fields`, `answers` | `attempt_profile_basis` (`031_research_workbench.sql:14`), неизменяемая | снимок анкеты, закреплённый за попыткой |

Дополнительные поля ограничены контрактом (до 5, `text`/`single_choice`), но по содержанию могут включать сведения, которые исследователь считает нужными; это проектируется на уровне исследования, а не платформы.

### 2.4 Ответы и результаты

| Поле | Где | Назначение |
|---|---|---|
| `item_id`, `value` | `responses` (`001_domain.sql:79`) | ответы участника по пунктам методики |
| `payload`, `responses_digest` | `attempt_results` (`001_domain.sql:84`) | рассчитанный результат и контрольная сумма входных данных |
| `status`, `revision`, `completed_at` | `attempts` (`001_domain.sql:68`) | факт и версия прохождения |

Связь с субъектом — через `attempts.participant_id` и `stage_enrollments`; прямой email в этих таблицах нет.

### 2.5 Согласия и уведомления

| Поле | Где | Назначение |
|---|---|---|
| `purpose`, `document_version`, `accepted_at_ms` | `participant_consent_acceptances` (`028_participant_consents.sql:46`) | факт согласия: `study_participation`, `secondary_research` |
| `pending_id`, `contact_id`, `notice_version`, `confirmed_at_ms` | `participant_contact_acceptances` (`023_participant_contact_identity.sql:33`) | факт принятия условий обработки контакта |
| `body_text`, `legal_status` | `consent_documents` (`028_participant_consents.sql:4`) | текст согласия |
| `body`, `legal_status` | `contact_notices` (`022_registration_pending.sql:3`) | текст уведомления о контакте |
| `contact_notice_version`, `participation_version`, `consent_policy_revision` | `stage_admissions` (`030_participant_stage_admission.sql:5`) | какая версия документов действовала на момент допуска |

### 2.6 Почтовый контур

| Поле | Где | Назначение | Срок |
|---|---|---|---|
| `recipient`, `token_envelope` | `contact_confirmation_outbox` (`022_registration_pending.sql:38`) | адрес и зашифрованный одноразовый код подтверждения | 24 часа (`089_registration_confirmation_ttl.sql`) |
| `email_key`, `password_hash`, `salt`, `confirmation_hash`, `browser_hash` | `registration_pending` (`022_registration_pending.sql:16`) | незавершённая регистрация | 24 часа |
| `email`, `message` | `research_reminder_outbox` (`031_research_workbench.sql:17`) | напоминания (сейчас синтетический контур) | не ограничен явно |

### 2.7 Аудит и технические журналы

| Поле | Где | Содержимое |
|---|---|---|
| `action`, `outcome`, `reason`, `actor_role`, `resource_id`, `record_count` | `access_audit_events` (`002_access_rls.sql:32`) | события доступа **без** email, кодов и ответов |
| `studies.*`, `statements` | `constructor_audit` | действия исследователя без ПДн |
| stdout/stderr процесса | systemd journal | приложение пишет только сообщения об ошибках старта; `Fastify({logger:false})` (`src/http/app.ts:4`) — журнала запросов нет |

## 3. Матрица копий (что и куда дублируется)

| Данные | Первичное место | Копии |
|---|---|---|
| Email | `participant_contacts.email_key` | `registration_pending.email_key` (24 ч), `contact_confirmation_outbox.recipient` (24 ч), `research_reminder_outbox.email`, backup БД |
| Анкета (пол, возраст, город, организация, образование) | `participant_passports.answers` | `research_profile_drafts`, `research_profile_history`, `attempt_profile_basis`, `attempt_results.payload` (косвенно), backup БД |
| Ответы | `responses` | `attempt_profile_basis` (не ответы), `attempt_results.payload`, backup БД |
| Псевдонимный код | `participants.display_code` | экспорт staff, панель progress, `stage_admissions` (косвенно) |

## 4. Правовые основания: что реализовано, а что нет

Реализовано в коде: фиксация согласий (`participant_consent_acceptances`), фиксация принятия условий контакта, версионирование документов, неизменяемость текстов согласий и уведомлений (`immutable_row`), запрет менять задним числом.

Ограничение, которое надо знать: и `contact_notices.legal_status`, и `consent_documents.legal_status` имеют ограничение `CHECK(legal_status='synthetic_only')` (`022_registration_pending.sql:5`, `028_participant_consents.sql:8`). То есть **реальные** тексты уведомления и согласия в текущую схему записать нельзя — только синтетические. Дополнительно допуск участника требует `studies.dataset_kind='demo'` и `legal_status='synthetic_only'` (`087_pilot_login_admission.sql:28,67-68`).

Следствие: пока система работает как учебный контур, даже при реальном email (после 085). Для реальной обработки ПДн нужны: реальные тексты, новый допустимый `legal_status`, снятие demo-гейта и пересмотр оценки вреда — это отдельное решение и отдельная миграция, а не «настройка».

## 5. Сроки хранения

| Данные | Срок | Как обеспечено |
|---|---|---|
| `registration_pending`, `contact_confirmation_outbox`, браузерная привязка | 24 часа | `expires_at_ms` (`089_registration_confirmation_ttl.sql:10,29,32`) |
| Сессии | TTL сессии | `expires_at_ms` в `*_sessions` |
| Анкеты, история анкет, ответы, результаты, согласия, аудит | **не определён** | бессрочное хранение; удаления/анонимизации нет |
| Backups (`pg_dump`) | **не определён** | файлы в `/var/backups/mettest`, ротация вручную |
| Просроченные `registration_pending` / outbox | фактически остаются | DELETE-функций нет; истёкшие строки просто перестают приниматься |

Пробел: нет ни одного механизма удаления/анонимизации по истечении срока и нет утверждённого перечня сроков. Это задача владельца (юридическое решение) + отдельная миграция/скрипт.

## 6. Возрастной барьер 18+ (проверка по коду)

Что есть: в актуальном определении базовых полей анкеты `age` задан как `integer` с `min:18, max:99` (`047_researcher_acceptance_workflow.sql:78`), а валидатор значений отвергает числа вне диапазона (`027_participant_passports.sql:19`).

Чего нет:

1. Поле `age` включается в анкету по выбору исследования; исследование может его не включать — тогда возраста нет вообще.
2. Регистрация собирает только email, пароль, версию уведомления и факт согласия (`src/application/participant-registration-api.ts:35`); проверки возраста на входе нет.
3. Субъект возникает в системе раньше анкеты: участник и контакт создаются при подтверждении email, а завершение паспорта требуется позже — для допуска к этапу. То есть участник без возраста существует легально с точки зрения кода.

Вывод: «до 18 нет» — это **политика**, а не техническое ограничение платформы. Чтобы это стало проверяемым фактом, нужен один из вариантов (решение владельца):

- обязательное поле `age`/дата рождения с `min:18` для всех исследований (изменение контракта схемы);
- проверка на входе (регистрация/допуск) с отказом при возрасте < 18;
- организационная мера: приглашения только в организации, работающие с совершеннолетними, плюс аудит.

## 7. Доступ к ПДн

- Роли: участник, исследователь, staff (администратор), супер-администратор.
- RLS включён на 39 таблицах, включая `participant_contacts`, `participant_passports`, `research_profile_*`, `responses`, `attempt_results`, `access_audit_events`, outbox-таблицы.
- Вне RLS — 21 таблица: служебные (`login_throttles`, `seed_runs`, `users`, `study_memberships`), таблицы идентичности и справочники (`participants`, `participant_credentials`, `participant_sessions`, `studies`, `research_groups`, `research_stages`, `stage_enrollments`, `assignments`, `researcher_*`, `staff_*`). Прямой доступ к ПДн у runtime-роли отсутствует: чтение/запись идёт через `SECURITY DEFINER`-функции с фиксированным `search_path`, гранты выданы по списку (`src/adapters/postgres/migrate.ts`) и проверяются на этапе выпуска (PR №145).
- UI не является границей доступа: все проверки — на сервере, в SQL-функциях.
- Экспорт staff (`staff_protocol_summary`, `staff_diagnostic_snapshot`) отдаёт `display_code`, а не email; панель «Ход исследования» после PR №144 не отдаёт email.
- Журнала запросов нет (`logger:false`); аудит — в БД. Для расследования инцидента этого достаточно по фактам доступа, но нет сетевых/HTTP-логов.

## 8. Что уже сделано для минимизации

- `participants.display_code` вместо email во всех исследовательских проекциях.
- PR №144: progress DTO/HTTP/UI без email; напоминания берут адрес из контакта.
- Экспорт протоколов не содержит email.
- Аудит не содержит email, кодов и ответов.
- Пароли и токены — только хэши; коды подтверждения — в зашифрованном конверте.

## 9. Пробелы (приоритет для следующих задач)

1. **Реальные тексты согласий и уведомлений невозможны** без изменения `legal_status`; demo-гейт запрещает реальный допуск. Критично для запуска реального пилота.
2. **Сроки хранения не утверждены**, удаления/анонимизации нет.
3. **Возрастной барьер 18+ не является техническим** (раздел 6).
4. **Backups не шифруются и не ротируются автоматически**; срок хранения не определён.
5. **Нет журнала запросов/мониторинга ИБ** — только аудит в БД; для У_зи и реагирования на инциденты нужно добавить.
6. **Подрядчики**: Selectel (хостинг/БД), Selectel SMTP — нужны договоры поручения обработки и требования к уровню зрелости (по проекту нового приказа ФСТЭК).
7. **Уведомление РКН** о начале обработки и оценка вреда — организационные действия, в коде не отражаются.
8. Нет автоматической проверки, что в БД нет данных несовершеннолетних (например, регулярный отчёт по `age < 18`).

## 10. Как проверить (SQL, только синтетика)

```sql
-- поля с потенциальными ПДн
SELECT table_name, column_name FROM information_schema.columns
 WHERE table_schema='pedpsy' AND column_name ~ '(email|age|sex|city|organization|education|answers|value|recipient)'
 ORDER BY 1,2;
-- RLS включён?
SELECT relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='pedpsy' AND c.relkind='r' AND NOT c.relrowsecurity;
-- истёкшие регистрации (после TTL они не удаляются)
SELECT count(*) FROM pedpsy.registration_pending WHERE expires_at_ms < extract(epoch FROM now())*1000;
```

## 11. Источники в репозитории

`storage/postgres/001_domain.sql`, `002_access_rls.sql`, `022_registration_pending.sql`, `023_participant_contact_identity.sql`, `027_participant_passports.sql`, `028_participant_consents.sql`, `030_participant_stage_admission.sql`, `031_research_workbench.sql`, `047_researcher_acceptance_workflow.sql`, `085_pilot_real_email.sql`, `087_pilot_login_admission.sql`, `089_registration_confirmation_ttl.sql`, `src/adapters/postgres/migrate.ts`, `src/application/participant-registration-api.ts`, `src/http/app.ts`, `web/workspace/app.js`.
