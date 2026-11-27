# Передача работы — МетодТест (PedPsyRU) — 27.11.2026

Это единственная контрольная точка проекта. Она заменяет параллельные STATUS/handoff-файлы; история — в Git и PR.

## 1. Состояние на момент передачи

- GitHub `main`: **`a52c379`** (merge PR #304). Развёрнутое приложение Selectel: **`a52c379`**, `/version` и `/health` — `ok`; код стенда совпадает с `main`.
- База стенда: применены миграции **153** (горячий путь участника) и **154** (имя исследователя); ledger заканчивается на 154.
- **Данные исследований очищены по поручению владельца** (27.11.2026): `studies=0`, `attempts=0`, `responses=0`, `participants=0`, исследователей нет; остались администратор и владелец (`users=2`). Каталог методик цел: 19 методик / 20 релизов / 609 пунктов. Аудит сохранён (18 266 записей).
- Резервная копия до очистки: `/var/backups/mettest/pre-cleanup-20261127T150245Z.dump` (проверена `pg_restore -l`).
- Участник: «Далее»/«Назад» рисуют следующий вопрос до ответа сервера; PUT черновика уходит в фоновую очередь с бейджем и повтором.
- Исследователь: может задать себе имя (`display_name`) в кабинете; администратор видит имя в списке и в выборе владельца исследования, логин остаётся идентификатором.
- Рабочее дерево: только untracked docs/loadtest-артефакты (§9).

## 2. Цель этапа

Довести авторские числовые методики до рабочего релиза и убрать деградацию участника: предзагрузку десяти форм, 500/503, deadlock, повторный session-preHandler и многосекундное сохранение черновика — без изменения научных ключей, RLS, CAS, scrypt, аудита и исторических результатов.

## 3. Выполнено

1. **Авторские методики.** Декларативный handler `authoring-numeric-1.0.0`, публикация неизменяемого релиза, каталог, назначение, участник, расчёт, результаты и экспорт. Лимиты: 30 показателей, 10 вариантов ответа, 150 вопросов.
2. **WHO-5.** Опубликован `authoring_who_5@1.0.0` (release `05d5e594-93a7-438a-87cf-ec969d3c98f9`), подписи исправлены через presentation correction; расчёт не менялся.
3. **Восстановление и сведения.** Восстановление после stale/401, bootstrap схемы сведений, профильные backfill-миграции; исправлено ложное «Сначала добавьте группу».
4. **Формы участника.** Ленивая загрузка: этап получает только `title/item_count/presentation_id`; полная форма — по «Заполнить». Убраны десять предзагрузок и повторная загрузка формы.
5. **Транзакции/блокировки.** Read-only форма использует `runRead()` без `touch_session`; participant-preHandler заменён на `assertSession()`; запись/завершение сохраняют `FOR UPDATE`/CAS.
6. **Наблюдаемость.** `request_id`, `pool_wait_ms`, `db_ms`, `db_queries`, `db_tx`, cache hit/miss и event-loop p95 в access-log.
7. **Связи/передача.** Профильный skill `pedpsyru-relation-guardian`; подготовлены `docs/performance/FULL_STUDY_200x10.md` и `loadtest/k6/full-study-200x10.js` (untracked).
8. **Оптимистичный рендер (PR #300).** Локальный черновик обновляется сразу, следующий вопрос рисуется до ответа сервера; PUT в фоне (один в полёте, остальные схлопываются), `expected_revision` сохранён; бейдж «Сохраняем ответ… / Не сохранено… Повторить», до 6 повторов; «Завершить» ждёт слива очереди.
9. **Серверная скорость сохранения (PR #303, миграция 153).** Причина трёх секунд — не диск и не один тяжёлый запрос, а `session_actor()`: SQL-функция с `current_setting`/`clock_timestamp()` внутри перестраивала план на каждом вызове (~10–11 мс, 1449 буферов), а RLS- и SECURITY DEFINER-цепочка вызывает её десятки раз за сохранение. Функция переписана параметризованной plpgsql (план готовится один раз на сессию). Второй множитель — предикат допуска внутри RLS; разрешённый вердикт запоминается на транзакцию (запрет пересчитывается всегда).
10. **Имя исследователя (PR #304, миграция 154).** `users.display_name` (nullable, 1–80 символов, CHECK), имя в `researcher_home()` и `list_researchers()`, `PATCH /api/v2/researcher/profile` (CSRF, строго одно поле, credential из сессии, аудит `researcher_renamed`), поле «Как к вам обращаться» в кабинете, имя в списке администратора и в выборе владельца исследования.

## 4. Изменённые файлы и компоненты

- **Авторские методики:** `src/adapters/authoring-method.ts`, `src/adapters/postgres/method-authoring.ts`, `src/application/method-authoring-api.ts`, `src/http/method-authoring-routes.ts`, `storage/postgres/142…152…sql`, `web/workspace/{index.html,app.js}`.
- **Формы/API участника:** `src/ports/participant-enrollment.ts`, `src/adapters/postgres/participant-enrollment.ts`, `src/application/participant-enrollment-api.ts`, `src/http/admission-routes.ts`, `web/workspace/participant.js`, `tests/postgres-workspace-browser.integration.js`.
- **Транзакции/сессии:** `src/adapters/postgres/unit-of-work.ts`, `src/adapters/postgres/identity.ts`, `src/ports/participation.ts`, `src/http/workspace-app.ts`.
- **Горячий путь участника (153):** `storage/postgres/153_participant_hot_path.sql`.
- **Имя исследователя (154):** `storage/postgres/154_researcher_display_name.sql`, `src/ports/researchers.ts`, `src/adapters/postgres/researchers.ts`, `src/application/account-api.ts`, `src/http/workspace-app.ts`, `src/adapters/postgres/migrate.ts`, `web/workspace/{index.html,app.js}`, `src/adapters/postgres/snapshot.ts`, `tests/postgres-workspace.integration.js`, `tests/postgres-researchers.integration.js`.
- **Наблюдаемость:** `src/http/request-metrics.ts`, `src/http/access-log.ts`, `src/bootstrap/instrumented-pool.ts`, `src/bootstrap/postgres-server.ts`, `src/ports/request-metrics.ts`.
- **Untracked, не включены в Git:** `docs/METHOD_AUTHORING_MODULE.md`, `docs/performance/FULL_STUDY_200x10.md`, `loadtest/k6/full-study-200x10.js`.

Полный перечень коммитов — Git/PR #290–#304; историю не переписывать.

## 5. Решения (действуют)

- Научное содержание восьми методик утверждено владельцем 23.11.2026; повторно не согласовывать, исторические выпуски/ключи/результаты не менять.
- Публикация авторской методики — staff administrator/superadministrator со свежей MFA; релиз неизменяем; исправления подписей — только presentation correction.
- Этап не загружает полные формы; DTO содержит только метаданные; форма — по действию «Заполнить».
- Read-only форма не вызывает `touch_session`; запись/завершение сохраняют `FOR UPDATE`/CAS.
- Participant preHandler использует `assertSession` без чтения attempts и аудита; staff/researcher preHandler не менять.
- Метаданные этапа возвращает `pedpsy.enroll_own_stage` (SECURITY DEFINER); не возвращать отдельный RLS-запрос по `release_items`.
- Разрешённый вердикт допуска кэшируется на транзакцию; запрет пересчитывается всегда, потому что `enroll_own_stage`/`accept_own_consent` могут выдать допуск в той же транзакции.
- `login_id` исследователя — учётка и ключ аудита, он не переименовывается; имя — отдельный атрибут аккаунта.
- Сначала измерения и ленивые формы; апгрейд 4 vCPU/8 ГБ не первый шаг. 200 VU — только на изолированном стенде.
- Восстановление связей — только аддитивное (correction/новая миграция/новый versioned release), с backup и отдельным разрешением.

## 6. Решения (отменены / не возвращаться)

- Не восстанавливать десять `/form` при открытии T0 и не делать форму повторной загрузкой.
- Не использовать глобальный `FOR SHARE` для identity-блокировок: это уже дало deadlock и сломало concurrency-тесты (PR #292).
- Не возвращать полный `participant.session()` в preHandler для `/profile`, `/consents`, `/stages`, `/stages/enroll`.
- Не возвращать metadata-запрос с подсчётом `release_items` под RLS: он занимал до 4,8 с.
- Не менять `pedpsy.enroll_own_stage`/миграции без транзакции и без явной схемы.
- Не переписывать историю через откат #297/#298; исправлять аддитивно.
- Не кэшировать запрет допуска и не кэшировать `session_actor` на транзакцию: повторная проверка сессии под блокировкой остаётся обязательной.
- Не начинать с закупки 4 vCPU/8 ГБ без нагрузочного доказательства.
- Не автоматически «лечить» production-БД и не выполнять merge/deploy без явного разрешения.

## 7. Ограничения

- 200 участников × 10 методик **не проверены**; сценарий k6 не запускался. Статус — **NO-GO для заявления 200 VU**.
- Не запускать нагрузку на production; нужен изолированный синтетический стенд.
- Не менять научные тексты, ключи, нормы, RLS, CSRF, scrypt, CAS и аудит.
- WHO-5: условия использования официальной формы/права требуют отдельной проверки.
- Абсолютные задержки и ёмкость на 2 vCPU не подтверждены для 200 VU.
- Per-request lock wait не измеряется access-log; нужны `pg_stat_statements`/`log_lock_waits`. Медленный лог PostgreSQL на стенде фактически **не пишет** (`log_min_duration_statement=500`, тестовый `pg_sleep(1.2)` в лог не попал) — инструмент надо починить.
- Штатный `scripts/migrate-production.js` на стенде неприменим: требует `PGSSL=require|verify-full` и пароль, а БД локальная по сокету. Миграции применяются `psql -1` + запись ledger с digest, который посчитает runner.

## 8. Проверки

- `npm run build`, `npm run typecheck`, `node scripts/check-architecture.js` — проходят (27.11.2026).
- Локальный полный `npm test`: **571/571**.
- CI PR #303 — 6/6; PR #304 — 6/6 (включая `PostgreSQL 18 isolation` и браузерный E2E).
- PostgreSQL 18 изолированно: `postgres-workspace` 4/4 (включая новый сценарий имени), `postgres-constructor-http` 4/4, `postgres-researchers` 8/8, `postgres-snapshot` 4/4, `postgres-api`/`workspace`/`staff-study-management`/`research-workbench` 24/24, `admission-http`/`participant-stages`/`stage-access`/`participant-consents`/`participant-enrollment` 59/59 (в том числе «отзыв доступа во время ожидания блокировки перепроверяется»).
- Замер на стенде после 153: `session_actor()` — **0,89–0,96 мс** на каждом вызове (до правки на быстрой машине 11–13 мс, на стенде кратно больше).
- Проверено на копии стендовой БД (локальный PG 18, роль с RLS): `owns_active_attempt` 3,97 → 0,075 мс на повторе, `SELECT attempts` под RLS 5,8 → 3,9 мс, `session_actor` 11 → 1 мс.
- Ledger стенда: 152, 153, 154 записаны; `public.enroll_own_stage` отсутствует; `display_name` присутствует; `rename_own_researcher` создана.
- Selectel: `/version` = `a52c379`, `/health` = ok, журнал после деплоя без ошибок, 5xx в nginx за сутки нет.
- **Не проверено:** сквозной `db_ms` сохранения черновика после 153 — со времени деплоя реальных сохранений не было (БД очищена).

## 9. Не завершено

- Измерить `db_ms`/`db_tx_ms` на первом реальном сохранении после 153 и записать в `docs/performance/FULL_STUDY_200x10.md`.
- Smoke T0 на новых данных: названия/`item_count`, **0** запросов `/form` до нажатия и **1** при открытии, мгновенное переключение вопроса, отсутствие 500/503.
- Зафиксировать baseline access-log (`pool_wait_ms/db_ms/db_queries/db_tx`).
- Решить судьбу untracked `docs/METHOD_AUTHORING_MODULE.md`, `docs/performance/FULL_STUDY_200x10.md`, `loadtest/k6/full-study-200x10.js`.
- Полный 200×10 k6-прогон и SQL-инварианты 2000 результатов.
- Настоящий zero-downtime deploy (сейчас graceful stop/start с коротким окном).
- Починить медленный лог PostgreSQL на стенде.

## 10. Проблемы и риски

- **Главный риск:** миграции, применённые вручную вне транзакции, создадут объект не в той схеме. Применять только через runner или `psql -1`, затем проверять `nspname` и ledger.
- Миграции на стенде применяются вручную (`psql -1`) с записью ledger — расхождение с `migrate-production.js` возможно, если digest не совпадёт; сверять `version/name/digest`.
- `main` и стенд совпадают (`a52c379`); каждый следующий docs-merge добавит SHA, не меняя код — не путать с деплоем.
- Фоновая запись: ответ, закрытый вкладкой раньше завершения PUT, может не дойти до сервера; при reload источник истины — сервер.
- Очистка БД необратима без восстановления из `/var/backups/mettest/pre-cleanup-20261127T150245Z.dump`.
- Имя исследователя — персональный атрибут: видно staff, не видно другим исследователям и участникам; не выводить его в публичные DTO.
- Метрики PR A активны только при включённом access-log; они не измеряют блокировки per-request.
- 2 vCPU/3,8 ГБ и отсутствие отдельного нагрузочного стенда остаются ограничением.

## 11. Неподтверждённое и противоречия

1. **Документ vs факт — снято:** прежняя запись указывала `main 357e662`, Selectel `adc7924` и «0 исследований»; фактические значения теперь в §1.
2. **Ветка vs main — снято:** локальные ветки синхронизированы, работа только от `origin/main`.
3. **Deploy vs main — снято:** `/version` совпадает с `main` (`a52c379`).
4. **Нарушение CHECK в `research_profile_drafts`** (обнаружено при копировании БД) — снято очисткой: таблица пуста.
5. **WHO-5:** права/условия официальной формы отдельно не подтверждены.
6. **200 VU:** не подтверждено; никаких выводов о ёмкости из текущего «быстро» не делать.
7. **Lock wait instrumentation:** access-log не измеряет per-request lock wait; вывод о блокировках основан на `pg_stat_statements`.
8. **Эффект 153 сквозным замером не подтверждён** — подтверждены только по-запросные замеры (§8).

## 12. Следующий шаг

Один конкретный шаг: владелец создаёт исследование и приглашает исследователя, тот задаёт имя; затем первое сохранение черновика участника даёт `db_ms` в access-log — зафиксировать его и сравнить с 3,2 с до 153.

Дальше: smoke T0 по списку §9, затем изолированный 200×10 прогон.

## 13. Ветка и коммит

- Ветка этой передачи: `docs/current-state-2026-11-27-4` (от `a52c379`).
- `main` / `origin/main`: код `a52c379c4c1c3dfe545b7a8807c3a3c68a92920f`; последний docs-merge добавит SHA, не меняя код.
- Развёрнуто: `a52c379c4c1c3dfe545b7a8807c3a3c68a92920f`.
- PR #298–#304: MERGED.
- Рабочее дерево: untracked docs/loadtest artifacts only.

## Как проверить восстановление контекста

```powershell
git -C PedPsyRU fetch origin
git -C PedPsyRU rev-parse origin/main
git -C PedPsyRU status --short
curl.exe -sS https://mettest.vibemind.pro/version
```

Ожидается: `origin/main` = развёрнутый `a52c379...` (или новее только на docs-коммиты), ledger 154, `studies=0`.
