# 02д — схема PostgreSQL и изоляция

Дата: 2026-10-03. Ветка codex/phase2-postgres-schema от main@da6bdbbb после #10. Пятая из восьми задач фазы2.

## Реализуемая проверка

Отдельные append-only PG migrations/checksum/rollback/idempotency. UUID/timestamptz/jsonb, bigint revisions с JS safe limit, scoped composite FK/deferred completion, value/immutable triggers, FK/query indexes. Existing SQLite migrations unchanged. Точная PG18.6 + official Docker Hub manifest digest; PG18 перечислен Selectel.

Минимальная runtime роль отдельно от migrator, без owner/superuser/BYPASSRLS/admin privileges/direct credentials reads. RLS diagnostic tables определяется реальным hashed session capability с текущим status/version/expiry, staff требует MFA proof; клиентские role/scope labels игнорируются. Fixed private SECURITY DEFINER functions, trusted search_path, PUBLIC grants revoked. Owner bypass сознательно нужен этим lookup functions, FORCE RLS не включен; runtime ownership не допускается. Это не право передавать SQL клиенту и не замена параметризованного API.

Семь engine tests: idempotency/checksum failure, runtime privileges, own/anonymous/foreign isolation, fake role/pool context leak, revoke, обе staff global read только с MFA/no participant writes, compositeFK/A-B/immutable/incomplete completion guards. Temporary DB/runtime role names generated/validated; test cleanup удаляет только точные synthetic targets. No real data, no cloud, no main SQLite changes.

## Доказательства и ограничения

Локальные strict typecheck/architecture/syntax проходят. PostgreSQL/Docker на Windows отсутствуют; локальный успех этих проверок НЕ означает SQL execution. Реальный engine proof выполняется обязательным GitHub job PostgreSQL18 isolation; актуальные run/head/результаты фиксируются перед merge. Test invocation без явного local PG environment fail, не fake success/skip. Owner fixture переносит только synthetic baseline, не migration acceptance реальных данных.

PG adapter и concurrency, snapshot migration/restore, new API end-to-end — отдельные 02е–02з. MFA enrollment/UI/manager operations будущие; CI synthetic MFA marker не объявляется реальной двухфакторной системой. Source verification, purpose/legal/minors/production остаются вне этого технического proof.
