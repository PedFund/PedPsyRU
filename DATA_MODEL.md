# Модель данных: пилот и тренировочная база 01д.2

## Актуальное дополнение фазы 4

Append-only `storage/postgres/011_study_constructor.sql`–`017_study_design_directory.sql`; PG001–010 и SQLite migrations unchanged. Новых диагностических таблиц нет. `studies.design_version` integer0–2147483646 — общий CAS title/groups/stages/assignments/copy/lifecycle. Сервер создаёт UUID/own membership/draft/demo/version0; client owner/role/status не authority.

012: нормализованная уникальность group name внутри study, fixed create/update control/experimental/other.013: unique normalized code/ordinal, same-study parent FK/parent-before-child.014: immutable release IDs для group×stage, keep ID неизменившихся assignments.015: independent copy/based_on_stage_id без диагностических строк.016: title/lifecycle/default active quota1 под credential lock; drafts/closed не активны, закрытие не удаляет данные.017: bounded snapshot/global staff directory без individual diagnostics.

Existing synthetic TKI key_verified/publication draft — технический allowlist, не научная публикация. Snapshot **format2** сохраняет design_version; legacy1 принимается с проверкой zero target. Domain snapshot исключает credentials/sessions/MFA/invites/audit, target пустой/provenance synthetic; nonzero7 roundtrip и реальный pg_dump restore проверены. Passport/consents/participant invitations — фаза5, не добавлены. Ниже история, включая прежний format1 и ещё будущую тогда квоту.

## Актуальное дополнение фазы3 (03а–03з)

Append-only PostgreSQL005–010 интегрированы#16–#23, не переписывают старые миграции/SQLite.005 researcher credentials/sessions/default active_study_quota1 и current membership resolver.006 hashed staff password challenges<=5min/attempts<=5, version invalidation.007 AES256GCM sealed MFA factors/confirmed/last_step, recovery **digests**, current staff locks/logout; externalkey не в DB.008 hashed24h researcher invites/used/revoked/createdby и private management/login/home.009 super-only role assignment/current-version revoke, session FK ON UPDATE CASCADE сохраняет revoked history; owner-only first synthetic staffbootstrap, не PUBLIC/runtimegrant.010 fixed global staff diagnostic read/export whitelist/single statement/MVCC/caps/audit, никаких новых диагностических таблиц/пересчета.

Staff role/TTL/idle/version/MFA и researcher version/current user/membership извлекаются только backend из текущей БД; HTTP не задает principal. Pending/researcher/participant не становятся staff. Export/read не записывают ответы/result. Импорт domain snapshot по-прежнему14tables без auth/factors/invites/keys/audit. Квота1 хранится, но создание/enforcement —следующая фаза4.195base+80actual PG/Chrome acceptance —PHASE3_ACCEPTANCE. Ни контакты/паспорт/consents/outbox/jobs, ни новые science metadata не добавлены.

## Дополнение 02д — PostgreSQL

03а добавляет append-only005: researcher_credentials (user/login/scrypt/version/status/quota=1), researcher_sessions (hashed token/current version/time/revoke), индекс membership по user/scope. Секреты runtime напрямую не читает. account_actor проверяет текущие researcher/staff credentials/user/session и MFA staff; account_owns_study — активное researcher членство demo. Researcher не включен в diagnostic session_actor/RLS. Новый check — server policy+audit, не capability для последующей мутации.006/03б добавляет hashed пяти-минутные staff_login_challenges; password/status/version guard отзывает старые sessions/challenges. Сам password не создает staff session. MFA/invite и кабинеты — отдельные03в–03з. Детали —ACCOUNT_ACCESS_VALIDATION.

Добавления02е–02з:003_scope_locks фиксирует порядок credential/session/scope/attempt locks и wall-clock проверку после ожидания;004_participant_identity вводит backend-only lookup/throttle/session issue/logout/metadata denial. Таблицы domain/auth прежние, UUID/версии/revisions/digest сохраняются. Нет прямого SELECT credentials runtime или HTTP-выдачи password material. Auth functions доверены только BFF, не пользовательскому SQL. Snapshot v1 переносит14domain tables, не credentials/sessions/audit; completed восстанавливается через действующий guarded переход без отключения triggers. Restore в другую пустую БД и ACL/RLS/data comparison проверяются отдельными реальными CI сценариями. Подробнее —SNAPSHOT_RESTORE_VALIDATION/PHASE2_ACCEPTANCE.

`storage/postgres/001_domain.sql` и `002_access_rls.sql` — отдельная append-only история с SHA256, не изменение SQLite001–003. UUID сохраняются, временные поля timestamptz, snapshots/results jsonb; revisions/input_revision bigint ограничены безопасными JS integer. Составные FK и deferred result/completed связи соответствуют SQLite; used releases/completed/responses/results заморожены triggers. Основные FK/query prefixes индексированы.

Привилегированный мигратор владеет таблицами и фиксированными SECURITY DEFINER функциями авторизации, runtime — отдельная роль без superuser/BYPASSRLS/ownership/role admin. Runtime не читает credentials/sessions/password hashes напрямую. RLS на diagnostic tables извлекает текущую сессию по opaque session hash, игнорирует role/scope labels клиента. Только participant own active assignment writes; обе staff роли global read при подтвержденной MFA, без participant writes. Owner bypass оставлен только для фиксированных private auth lookups: FORCE RLS не включен, чтобы избежать рекурсивных policy и зависимости от BYPASSRLS на managed PG. Runtime никогда не владелец, этот инвариант проверяется реальным SQL под runtime ролью. Function EXECUTE revoked from PUBLIC, fixed trusted search_path, явные grants. Это secondary barrier, не предоставление клиенту SQL-доступа.

История фазы2: staff_sessions получила nullable mfa_verified_at; тогда enrollment/login еще не существовали, proof был только тестовым. Фаза3 добавила настоящие password/TOTP/recovery и отдельные HTTP/cookies; current proof/version/status/expiry проверяются сервером. Legacy sessions/credentials при переносе snapshot не копируются; контур остается synthetic, не production.

Актуализация 01е: сервис результата storage/completion.js использует существующую attempt_results и взаимные FK, без новой миграции. Полный сохраненный снимок → закрепленный scoreTki → один result/completed/revision/audit, повтор без перерасчета; собственный GET результата. 134 теста пилота, COMPLETION_VALIDATION.md. Интегрировано в main через PR #7; приемка — INTEGRATION_VALIDATION.md.

Проект фазы 2 — PHASE2_DESIGN.md: владелец принял PostgreSQL и сохранение проверенных контрактов. Будущие профили/согласия, processing_runs, support_cases, jobs/outbox описаны как проект, не существующие таблицы. SQLite-миграции 001–003 остаются прежними. Контакты/паспорт и связанные диагностические записи проектируются с защитой персональных данных; принадлежность разным исследованиям не объединяется автоматически по email.

Дата: 2026-10-03. SQLite/seed созданы в 01д.2; 01д.3а — вход участника/scoped чтение; 01д.3б — глобальный просмотр/скачивание обеими административными ролями; **01д.4 — запись и восстановление собственного черновика**. SQL 002/003 отделяют participant и staff credentials/sessions от диагностики. Черновик использует существующую схему 001, новой миграции нет. Границы — ACCESS_VALIDATION.md, ADMIN_VALIDATION.md и DRAFT_VALIDATION.md; права — ACCESS_POLICY.md; реализованные и будущие операции — STORAGE_CONTRACT.md.

| Объект | Поля пилота | Связи |
|---|---|---|
| Версия формы | `id`, `version`, `method_id`, `status`, `provenance` | Содержит 30 пунктов |
| Пункт | `id`, `number`, `options` | Две альтернативы A/B |
| Альтернатива | `value`, `label`, `text`, `source_text` | Текст отделен от расчетного ключа |
| Версия ключа | `id`, `key_version`, `items`, `type`, `scales`, `verification` | Только исправленная 1.0.0 хранится отдельным JSON |
| Вход расчета | `contract_version`, `method_version_id`, `handler_version`, `responses` | Пункт связывается по ID, не по позиции массива |
| Результат | `status`, `validation_state`, `quality`, `measures`, `warnings`, `calculation` | Пять сырых показателей и digest ключа |

Запись прохождения хранит собственный ID и ссылки на версии формы/методики/обработчика. Исследование, группа, этап и участник связываются с прохождением отдельными идентификаторами. Создание нового этапа не копирует прежние ответы.

Форма привязана к `tki_ru_30_pairs@1.0.0`, обработчик — `tki-contract-0.3.0`. Старый ключ удален, прежние версии недоступны. Неизвестные версии возвращают `blocked` без баллов. Результат содержит версии и digest; сохраняется сервисом завершения 01е в attempt_results.

Демонстрационный API 01г по-прежнему выдает `{demo: true, persistence: false, form, versions}` и `{demo: true, persistence: false, result}`. Сохраняемое прохождение 01д.4 выдает `{attempt: {demo: true, persistence: true, ...}}`, закрепленные версии/форму, ответы/слайд/revision. Оба режима не выдают source_text и ключ. GET/PUT draft не выдают результат и не вычисляют баллы.

Отношения и ограничения приведены ниже. Для учебного контура выбран встроенный node:sqlite на проверенной среде Node.js 22.17.1 / SQLite 3.50.0, без внешних пакетов. Это не production-стек. Выбор половой категории не требуется и не влияет на пять сырых шкал. Существующий JS-вычислитель не переписывается.

## Связи тренировочного контура

```text
Исследование ── группы, этапы, участники
Группа + этап + выпуск методики ── назначение
Участник + группа + этап ── участие на этапе
Участие на этапе + назначение ── попытка
Попытка ── ответы по ID, текущий слайд, ревизия
Завершенная попытка ── один результат и сведения расчета
```

Аккаунт исследователя не заменяет запись участника. Участник относится к одному исследованию; личности разных исследований автоматически не связываются. Группа фиксируется на этапе, чтобы будущая смена группы не переписала прошлое. Нет ограничения «одна КГ и одна ЭГ» или «только T0–T2».

## Общие правила

- ID — серверные непрозрачные UUID, не разрешения доступа. Время — серверное UTC; сохраняются created_at, updated_at и completed_at, клиентские часы не источник истины.
- В первой миграции `studies.dataset_kind` допускает только `demo`. Дочерние записи наследуют режим через исследование, клиент его не задает. Реальный контур — отдельная задача.
- Дочерние исследовательские записи содержат study_id. Ссылки проверяют `(study_id, id)`, а не только глобальный ID. Для попытки дополнительно совпадают группа, этап и выпуск назначения/участия.
- FK, уникальности, статусы и диапазоны закрепляются миграциями. Правила, не выраженные ограничениями базы, проверяются сервером и транзакциями; скрытых полей UI недостаточно.
- Завершенные ответы/результат и используемый выпуск нельзя менять на месте. Это не отменяет будущие правила сроков хранения, отзыва и разрешенного удаления; бессрочное хранение не утверждается.

## Предлагаемые отношения первого контура

13 таблиц реализованы в `storage/migrations/001_training.sql`. Дополнительно: schema_migrations, seed_runs; ответы `/take` поступают в responses, позиция/revision — в attempts одной транзакцией. Физические поля attempts.group_id/stage_id, completion_result_id и attempt_results.attempt_status описаны в storage/README.md. Таблицы результата используются серверным сервисом завершения 01е.

| Отношение | Основные поля | Ограничения/назначение |
|---|---|---|
| `users` | id, status, временные поля | Аккаунты исследователей/администраторов; без открытых паролей. Организации/квоты вне этого пилота |
| `study_memberships` | study_id, user_id, role, status | Явные полномочия в исследовании; unique(study_id,user_id,role). Клиент не задает себе роль |
| `studies` | id, title, status, dataset_kind | Тестовый seed — два синтетических исследования, не архитектурный предел числа исследований |
| `research_groups` | id, study_id, name, kind, status | kind: control/experimental/other; произвольное число групп |
| `research_stages` | id, study_id, code, ordinal, status, based_on_stage_id? | unique(study_id,code) и unique(study_id,ordinal), ordinal >= 0; предыдущий этап из того же исследования, копируются настройки, не ответы |
| `instrument_releases` | id, method_id, form_id, form_version, method_version_id, handler_version, contract_version, form_digest, key_digest, verification_state, publication_state, artifact_ref | Выпуск связывает точные версии формы/ключа/обработчика; используемый выпуск неизменяем. У TKI key_verified, но полная методика остается draft |
| `release_items` | release_id, item_id, ordinal, options | PK(release_id,item_id), unique(release_id,ordinal). options — проверенные коды/тексты из JSON; у TKI 30 упорядоченных пунктов, ровно A/B |
| `assignments` | id, study_id, group_id, stage_id, release_id, status | Назначение группа–этап–выпуск; unique(study_id,group_id,stage_id,release_id). Не единый набор для всех групп |
| `participants` | id, study_id, display_code, status | Код уникален внутри исследования, но не авторизует. В тесте нет ФИО/email/телефона |
| `stage_enrollments` | id, study_id, participant_id, group_id, stage_id, status | unique(study_id,participant_id,stage_id); участник/группа/этап из одного исследования. Смена группы после начала попытки запрещена без отдельного сценария |
| `attempts` | id, study_id, enrollment_id, assignment_id, release_id, status, revision, current_item_id, временные поля | unique(study_id,enrollment_id,assignment_id): одна попытка в первом контуре. Назначение и участие имеют одинаковые группу/этап; выпуск соответствует назначению и фиксируется при создании |
| `responses` | study_id, attempt_id, release_id, item_id, value, updated_at | PK(attempt_id,item_id); ссылки на выпуск попытки и пункт выпуска; у TKI только A/B. Пропуск — отсутствие строки, не фиктивный ответ/ноль |
| `attempt_results` | id, study_id, attempt_id, release_id, input_revision, responses_digest, contract_version, handler_version, key_digest, calculated_at, payload | unique(attempt_id); payload — полный серверный результат текущего контракта, включая measures, quality, validation_state, warnings. Одна успешная фиксация |

Одинаковый study_id проверяется для всех связанных участников, групп, этапов, назначений, попыток и результатов. Release_id ответа/результата обязан совпадать с попыткой; current_item_id обязан принадлежать ее release. Конкретные составные FK/серверные проверки выбираются при миграциях и проверяются отрицательными тестами, а не предполагаются обеспеченными простыми FK по id.

`form_digest` — SHA-256 всего исходного JSON формы: canonical-json-v1 сортирует ключи объектов, сохраняет массивы/тексты и хэширует JSON в UTF-8. Выпуск хранит form_snapshot. Канонизация реализована/проверена в 01д.2. `key_digest` использует существующую канонизацию обработчика, не новую формулу. Artifact_ref — ссылка на пакет репозитория, не URL клиента. Ключ через API формы не выдается.

Snapshot выпуска нужен для воспроизводимости, не для второго редактора. Release_items импортируются из зафиксированного пакета; исследователь не редактирует тексты/ключи. Изменение версии создает новый выпуск, активные попытки не переназначаются молча. Старый ошибочный ключ TKI в тренировочный каталог не импортируется.

## Доступ и согласия — связанные модели

Миграция 002: participant_credentials (study/participant, login_id, scrypt scheme/salt/hash, version/status), participant_sessions (token_hash, credential/scope/version, время/отзыв), login_throttles и append-only access_audit_events. Миграция 003: staff_credentials (user_id UNIQUE FK, login_id UNIQUE, фиксированная role administrator/superadministrator, scrypt scheme/salt/hash, version/status) и staff_sessions (token_hash, credential/user/role composite FK, версия, время/отзыв). Staff login/role/user identity нельзя UPDATE/REPLACE/DELETE; отзыв увеличивает версию и блокирует сессии. User.status=disabled блокирует доступ. Миграции 001/002 не редактировались.

В access_audit_events добавлены nullable actor_role, resource_id, record_count; ответы/тексты/пароли/токены туда не записываются. Старый participant-аудит совместим. В обеих staff-ролях область — все исследования, включая закрытые. study_memberships не заменяет глобальную роль и не дает исследователю staff-экспорт. Policy разрешает researchers.manage обеим ролям и methods.manage только superadministrator; эти manager-операции еще не реализованы. Согласия consent_events, юрисдикция и несовершеннолетние — отдельные решения. Seed не создает credentials; staff CLI не назначает роль произвольному существующему исследователю, а выдает отдельную вымышленную учетную запись.

## Состояния и воспроизводимость

У attempts в первом контуре два статуса: draft/completed. Revision — целое >= 0, увеличивается при атомарной записи состояния. Current_item_id принадлежит выпуску (TKI q01–q30); номер слайда выводится из ordinal. Черновик содержит выбранные ответы и слайд, невыбранные пары остаются пропусками.

Сервис завершения 01е проверяет полный сохраненный согласованный снимок, вызывает существующий обработчик, атомарно фиксирует результат и completed_at. Повтор возвращает тот же результат без новой строки/расчета. Ошибка записи/вычисления не завершает попытку. Result.input_revision соответствует снимку до завершения; увеличение attempts.revision при фиксации не меняет ссылку на вход. Версии/ключ digest/время/payload/responses_digest сохраняются сервером, не задаются клиентом.

T1/T2 — новое участие на этапе и новая попытка, ответы T0 не копируются. Для ретеста того же назначения потребуется отдельное правило и изменение уникальности; скрытого множителя попыток нет. Пересчет завершенного результата в первом контуре запрещен; будущая история расчетов добавляется отдельно, не перезаписью результата. Успешный запуск расчета представлен метаданными result; ошибки отражаются кодами аудита без ответов/баллов, полноценный реестр запусков — будущий модуль.

«Начать заново» очищает только свой draft после подтверждения через тот же PUT пустого снимка с expected_revision, не завершенное обследование. Правила ревизий, конфликтов, очистки и будущего атомарного завершения — `STORAGE_CONTRACT.md`.

## Вне первой миграции

Полный кабинет, паспорт, приглашения/QR, организации, квоты, редактор библиотеки, manager CRUD, групповое качество, агрегаты, статистика, специальные grants и реальный набор. Административное чтение/JSON-экспорт реализовано отдельной миграцией 003; запись черновика — 01д.4, собственный raw result — 01е. Серверы/облака не устанавливались, JS-ядро не переписывалось. Нет auto credentials/универсальных паролей.
