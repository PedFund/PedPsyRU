# Фаза2 — техническая приемка

Дата2026-10-03. Задача02з, восьмая из восьми; codex/phase2-api-acceptance от main@5bfb5c44 после#13. До green CI текущего head не объявляется интегрированной.

**Итог: фаза2 принята технически и интегрирована,8из8.** [PR#14](https://github.com/PedFund/PedPsyRU/pull/14) merged `4a86cb44e5d751018cd10cc7e1538c2bec6990f0`; head5b42cce7/[run37130462614](https://github.com/PedFund/PedPsyRU/actions/runs/37130462614): все6jobs completed/success,179base+38/38PG18.6,0errors/skip. Logs подтверждают8APIscenarios, настоящий HTTP и backup restore.126blobs/preview merge tree сверены, source/math/security primitives preserved. Это техническая приемка synthetic контуров, не независимый security аудит/научное утверждение/production.

## Новый контур

Fastify → application/ports → PostgreSQL runtime UnitOfWork → неизмененный JS TKI. PostgreSQL18.6/пакеты точные, Node22/24 checks, strict TS/AST dependency guards, npm audit/Gitleaks. SQL migrator отдельно от runtime, составные FK/guarded immutability/RLS и local session capability. В новой004 добавлены только backend-only участнические auth functions; прошлые001–003/checksum/SQLite migrations не переписываются. Никаких новых научных решений/норм/методик.

Participant API `/api/v2/participant`: login, session/list, logout, attempt/form/draft/complete/result. Предъявление формы —30устойчивых пар A/B; ответ формы содержит только id/version/items с public text, безsource_text/key/provenance/служебных auth fields. Существующий браузер4173 со слайдовой формой остается прежним; v2 backend не считается новой manager UI.

Вход повторно использует прежние salted scrypt primitives/параметры. Postgres backend читает через ограниченную lookup function только material одного логина; HTTP его не сериализует. Durable глобальные/персональные throttle buckets, одна memory-expensive derivation на gateway, derivation вне transaction. До выдачи случайного token credential/status/version/hash/study/participant перепроверены под совместимыми locks. Rotation/logout/audit атомарны. DB хранит SHA256token, клиент — bounded HttpOnly SameSite Strict cookie; HTTPS получает Secure/__Host prefix. Нет login-by-role/body/header, impersonation, автоматического staff creation или выдачи участнику email.

Runtime DB credentials — доверенный секрет серверного приложения, не SQL-интерфейс для пользователя. Auth functions расширяют внутреннюю возможность BFF проверять пароль/создавать сессию, не права participant/staff/researcher. Прямого SELECT private credentials/sessions по-прежнему нет; DDL/owner/super/BYPASSRLS/membership запрещены. Компрометация runtime DB секретов остается угрозой, а RLS не считается защитой от произвольного кода самого backend. Изоляция сети/секретов/production отдельно.

Exact origin/Host, Fetch-Site, mutation CSRF; bounded JSON, отказ extrafields/клиентских scores/roles/версий, равные foreign/missing404, no CORS/stack/SQL/password echoes. Response DTO — whitelist; actor context/credential material/token не возвращаются JSON. Обязательные allow audit и отдельные metadata-only denial events без чужих IDs/текста/ответов. Audit failure →fail closed; transaction result не фиксируется без required audit.

Обе staff роли сохраняют утвержденное глобальное read policy с MFA proof на уровне PG RLS; в participant API staff realm отказывается, а не превращается в участника. Researcher API индивидуальных протоколов отсутствует. Manager/MFA enrollment/staff results UI следующей фазы, не маскируется тестовым MFA marker.

## Проверки и границы

Первый run37130025396:179base успешно,37/38PG успешно; один scope test не дошел до HTTP assertion из-за bigint/double precision вывода типа в synthetic staff session INSERT. Фикстура исправлена explicit bigint casts; scenario также подтверждает обе действующие MFA staff роли/global SQL read прежде чем проверять их отказ в participant API. Production code/policy по этой находке не ослаблялись; полный CI нового head обязателен.

Run37130227994 подтвердил исправленный SQL и179base/37PG; HTTP test helper передавал undefined CSRF header для read-only staff GET и был отвергнут самим injector до запроса. Helper теперь пропускает отсутствующий header, как реальный HTTP. Product checks не отключались; scope scenario остается обязательным.

5HTTP/config tests + прежние174 →179base. 8новых PG API scenarios + прежние30 →38PG tests: partial/full TKI/rawprofile, CAS/complete/retry/recreate/relogin без перерасчета; own/foreign/cross/missing/anonymous/staff; Origin/CSRF/DTO; uniform login +durable throttle; revoke во время hashing; audit rollback complete/login rotation; idle/absolute expiry/pool isolation; реальный HTTP loopback login/save/complete/result.

Новый synthetic bootstrap `npm run start:platform:demo` требует явный PEDPSY_PG_DEMO=1, loopback PGHOST, validated pedpsy_demo_<16hex> и не-owner runtime имя/секрет изenv. Пул4 — ограничение учебного профиля, не обещание оптимальной production емкости. Нет startup migrations/seed/auth issuance; database schema/data/credentials готовятся offline в отдельно разрешенном synthetic контуре. Production/Selectel/remote DB отвергается этой конфигурацией. Health-only `start:platform` и обычный4173 не переключаются.

Local Windows без PostgreSQL/Docker: здесь179base/build/typecheck/architecture/syntax/lock checks, реальные PG/backup/HTTP подтверждаются обязательным текущим GitHub CI. Реальных участников/паспортов/email/backup в GitHub нет. Original SQLite readOnly inspection и original core/form/key SHA сохранены. No force/history deletion; локальная папка не Git checkout, tree consistency доказывается Git blob SHA.

Restore/rollback процедура — SNAPSHOT_RESTORE_VALIDATION.md: исходная SQLite сохранена; importfail atomically rolls back, восстановление в новую БД, ACL/RLS до runtime, no reverse writeback/overwrite. Проверенный synthetic pg_dump restore не доказывает production RPO/RTO/PITR. Server-side branch protection недоступна на текущем private тарифе; current head/jobs/diff/tree проверяются до разрешенного technical merge, обход green checks запрещен.

## Следующий продуктовый этап

Фаза3 — учетные записи/роли/кабинеты; начать с administrative MFA foundation, затем приглашений/блокировки исследователей, назначения staff только суперадмином и защищенных глобальных view/export ответов и результатов. Разложить на небольшие задачи с положительными/отрицательными tests, не одну громадную реализацию. Фазы4+research builder, consent/passport, methods/analytics/jobs/email/support позже. Уже согласованные target rights не требуют повторного утверждения; новые права/методики/платные сервисы/публикация — отдельно.

Перед реальным набором обязательны юридические роли/цели/поля/сроки/основания/отзыв/backup; ответ о несовершеннолетних пока не получен. Эти вопросы не блокируют synthetic technical phase и не объявляются решенными.
