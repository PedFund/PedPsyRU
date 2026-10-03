# 02г — async контракты и SQLite-адаптер

Дата: 2026-10-03. Ветка codex/phase2-storage-contracts от main@caa225a0 после интегрированной 02в (#9). Четвертая из восьми задач фазы 2; PostgreSQL и новый HTTP-сценарий еще не объявляются реализованными.

## Сделано и проверено локально

Общий async read/save/complete/result application service, runtime-validation входов, типовые repository ports; SQL вынесен в отдельный SQLite UnitOfWork прежней схемы. Выделенное соединение, serialized callbacks, BEGIN IMMEDIATE, проверка текущей session/scope, закрытие ports после транзакции, запрет nested, fail-closed mandatory audit. Не меняются прежние storage/*.js/миграции, core/ключ/форма и рабочий 4173.

**171 успешный тест**, 0 ошибок/пропусков: 154 прежних и 17 новых (12 общей contract suite, 5 SQLite-specific). Strict build/typecheck, architecture, syntax, lock policy прошли. Повторный focused прогон после расширения audit также прошел.

Общие сценарии: собственный снимок/слайд/reload, одинаковый отказ чужому/отсутствующему ID, подделка контекста/staff realm, два save одной revision, строгие invalid ответы, incomplete/no result, full complete с исходными scores/digest/versions, повтор/два завершения без дубля, revoke, закрытие assignment, rollback snapshot/revision и result/completed при audit failure.

SQLite-specific: ports после commit/nested запрещены; новое save → старое complete и старое save → новое complete → legacy read совпадают по result ID/payload/digest; ошибка/неподдерживаемый scorer не завершает попытку; UnitOfWork mutation без mandatory audit не commit. Только новые :memory: synthetic базы и случайные тестовые credentials; основной файл базы не открывается/не изменяется.

## Границы

Подтверждена техническая совместимость JS/TKI, не научное утверждение методики. UI/Origin/CSRF/denial mapping нового API пока не переносились; прежние защищенные маршруты проходят регрессию. Raw токен хранится только в private WeakMap, не в serialized context; каждый callback повторно проверяет текущую сессию. Выделенный SQLite connection нельзя одновременно использовать прежним synchronous store во время awaited callback. Произвольные внешние await/HTTP/mail в transaction не предусмотрены.

Outbox контракт зарезервирован для будущих jobs, вызов SQLite enqueue явно выбрасывает OUTBOX_NOT_IMPLEMENTED; не создана реальная почта/очередь и не объявлена доставка. PG schema/runtime role/RLS/adapter и pool races — 02д–02е. Migration snapshot/restore — 02ж, сквозной API — 02з.

Удаленный CI на текущем PR/head проверяется перед техническим merge; локальный успех сам по себе не объявляется GitHub green. Branch protection по-прежнему ограничена тарифом.
