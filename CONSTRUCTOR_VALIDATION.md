# Конструктор исследований — контракт и проверка

Дата2026-10-03, только synthetic development, не научная/production-приёмка. 04а–04ж в main #25–#31,04з расширяется. CI/merge — PHASE4_ACCEPTANCE/STATUS; прежние локальные «pending» заметки заменены проверяемой спецификацией.

## Кто что делает

|Роль|Конструктор|Диагностика|
|---|---|---|
|Исследователь|Свой draft/title/groups/stages/sets/copy/activate/close|Нет индивидуальных ответов/баллов|
|Администратор|Глобальный список/read-only дизайн|Прежние глобальные read/download raw+stored individual result|
|Суперадминистратор|Тот же read-only дизайн, не подмена researcher|Прежние read/download; processing/help/editor ещё будущие|
|Participant/pending/anonymous|Нет доступа|Только свой прежний participant flow по действующей сессии|

UI не авторизует. Current credential/session/user/MFA/membership повторяются под locks; named policy до COMMIT — дополнительный барьер. Direct DML/private helpers runtime запрещены. Researcher realm не diagnostic RLS.

## Данные и API

StudyDesign: server UUID/title/status/version/demo; groups(id/name/kind/status), stages(id/code/ordinal/status/based_on_stage_id), assignments(id/group_id/stage_id/release_id/status), catalog metadata. Нет answers/results/keys/form/source/credentials.

- POST `/api/v2/researcher/studies`: title; сервер UUID/own membership/draft/version0.
- GET researcher study/:id — own membership; GET staff studies и /:id —global read-only.
- PATCH study: title/expected_version; POST/PATCH groups: name/kind/expected_version; stages: code/ordinal/expected_version.
- POST assignments: group_id/stage_id/release_ids/expected_version, replace только одной ячейки, keep IDs неизменившихся assignments.
- POST stages/copy: source_stage_id/code/ordinal/expected_version; новые stage/assignment UUID per-group, independent copy.
- POST lifecycle: status active|closed/expected_version. Draft→active→closed или draft→closed; closed не reopen. Повтор текущего статуса/currentversion идемпотентен и audited; staleversion conflict.

Точные входные поля/типы, CSRF до тела; client owner/role/status/release contents/calculated scores не authority. Foreign/absent одинаково404. Draft/no attempts — единственный mutable design. Все настройки до activation; active/closed/attempt-bearing frozen. Close сохраняет данные, сериализуется со study SHARE participant writer; после закрытия write denied.

Default active quota1 под credential UPDATE lock. Draft/closed не расходуют. Activation требует одного active researcher owner/no attempts, group/stage, непустого allowlisted set каждой active group×stage ячейки. Shared ownership/quota override/active revisions/deletion не реализованы.

Пределы: title200/group name100/stage code40; ordinal0–9999;50groups/50stages;10distinct release IDs/input;500owned studies/500global directory;4MiB metadata. Явный отказ, не truncation. Existing group edit возможен при cap. Version0–2147483646, saturation откатывает mutation.

## Выпуск, copy, перенос

Только exact existing synthetic TKI package (версии/digests/30items). Key_verified, **полная методика publication draft**, не научно approved. Draft empty set допустим, activation отказывает. Copy не читает/создаёт participants/enrollments/attempts/responses/results, не угадывает missing T0. Участники последующих этапов —фаза5.

Append-only PG011–017, original001–010/SQLite unchanged. Snapshot2 сохраняет design_version, legacy1 zero target check. Auth/MFA/invites/audit не экспортируются, empty target/synthetic provenance обязательны; actual PG nonzero7 roundtrip/backup restore passed. Core/key/form/processor побайтово прежние.

## Проверки и ограничения

Pure/HTTP плюс real PG: own/foreign/roles/CSRF/CAS/unique/per-cell assignments/copy/no diagnostics/quota race/frozen/participant lock/audit rollback/size caps. Real Chrome: invite/researcher login/create/КГ/ЭГ/T0/assign/copyT1/T2/reload/shared-cookie two-tab CAS/quota/close/staff readonly/text escaping/390px/logout/HttpOnly/no storage. Три дополнительные независимые browser runs обязательны, не retry-to-success.04з добавляет lock-wait revocations/caps/fake release/lifecycle rollback/private helpers; до актуального CI не принято.

Первый#25 head3f9bd3e/run37144352030:80/83PG,3snapshot regressions после design_version; merge остановлен. Исправлен перенос format2/legacy1/nonzero7, tests не ослаблены. Final e51bfc88/run37144756732:84/84PG/all6success. История сбоя сохранена.

UI server-confirmed save, conflict/uncertain outcome блокирует writes до explicit reload, без blind retry/auto merge. Logout очищает private DOM, localStorage diagnostic data отсутствуют. Local4175 UI/API503 без PG; full4174 realengine/browser —disposable CI. Старый4173/SQLite не переключены. No new npmdependencies/Selectel/paid/realaccounts/data/publication. CI не scientific validity/pentest/legal/production acceptance.
