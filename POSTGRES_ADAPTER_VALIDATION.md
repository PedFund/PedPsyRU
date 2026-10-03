# 02е — PostgreSQL-адаптер и конкуренция

Дата: 2026-10-03. Шестая из восьми задач фазы 2, ветка codex/phase2-postgres-adapter от main@687b207d (#11).

## Реализация

Async PostgreSQL UnitOfWork использует один выделенный PoolClient на операцию, BEGIN/COMMIT/ROLLBACK, transaction-local capability и ограничения времени SQL/блокировок. Фабрика контекста принимает только действующую серверную сессию; WeakMap запрещает поддельный DTO. Runtime owner/superuser/BYPASSRLS/членство в ролях отвергаются. После commit/rollback порты недействительны; вложенные UnitOfWork запрещены.

Append-only migration 003 устанавливает fixed SECURITY DEFINER lock function с отозванным PUBLIC execute. Порядок: credential → session → study → participant → group → stage → enrollment → assignment → attempt. Один attempt на транзакцию; ожидание revoke/close приводит к новой проверке авторизации и актуальному RLS, а не сохранению устаревшей проверки. Права не расширены: оба staff читают глобально по прежней политике, participant пишет только свое. Runtime не получает прямой доступ к auth tables.

CAS snapshot/revision, полный pinned TKI, atomic result/completed и обязательный audit. Повтор завершения возвращает сохраненный результат. Scorer failure, неподтвержденная версия, ошибка записи/audit откатывают все изменения. Outbox явно не реализован; внутри транзакции нет email/HTTP. Проверенный JS core, ключ, форма и SQLite миграции не меняются.

## Приемка

12 общих storage contract scenarios запускаются и на SQLite, и на PostgreSQL. Еще 8 PG-adapter scenarios проверяют жизненный цикл/вложенность, mandatory audit, запрет owner pool, revoke/save, close/complete, save/complete, scorer rollback и очистку контекста обоих соединений пула. В трех гонках owner-тест наблюдает реальное ожидание Lock через pg_stat_activity перед снятием блокировки — не произвольный sleep и не последовательная имитация.

С семью schema/RLS scenarios всего 27 PG engine tests. Локальные build/typecheck, AST architecture и syntax проходят; локальный Windows не имеет PostgreSQL/Docker. Обязательный GitHub job выполняет настоящие SQL/транзакции на закрепленном PG18.6; успех/ошибка текущего head фиксируются перед merge, проверки не отключаются. Основной стенд4173 и исходная учебная база остаются прежними.

Snapshot import/backup/restore — 02ж, новый API/E2E — 02з. Это не production, не научная приемка интерпретаций и не реализованный manager/MFA enrollment контур. Короткие транзакции, отдельный migrator, ограничения runtime и порядок блокировок выбраны с учетом postgres-best-practices; Supabase сервис не используется.
