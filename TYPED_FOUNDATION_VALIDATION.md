# 02в — типизированная основа

Дата: 2026-10-03. Ветка codex/phase2-typed-foundation от main@36409eb1 после принятого PR #8. Это третья из восьми задач фазы 2, не готовая PostgreSQL-платформа.

## Реализовано

Strict TypeScript build/typecheck, внутренние async UnitOfWork/repository ports, typed оболочка прежнего scoreTki, Fastify health без диагностических/manager endpoints. Новый runtime только loopback 4174 при явном start:platform; pilot start/4173 остаются прежними. Build копирует вычислитель/его data imports побайтово, без БД/credentials. Нет новой методики, научных порогов или новых прав.

AST заменяет regex guard, анализирует JS/TS require/import/export/import-type, TS resolution, циклы и архитектурные границы. Отрицательные тесты cross-layer, require aliases/computed loaders/dev packages runtime/циклы/tracked dist. Типовые отрицательные тесты realm, A/B и removed version проверяются компилятором. Lock policy проверяет точные direct versions, registry/integrity/license/install scripts.

## Локальные проверки

Typecheck, build, architecture, syntax и lock policy выполнены успешно. Первый полный прогон: 151/151 (143 прежних + 4 AST + 4 skeleton); обнаруженное ложное распознавание require.main исправлено без отключения guard. После трех lock policy тестов итоговый полный прогон: **154/154**, 0 ошибок/пропусков. Typed scorer сравнен с исходным на 62 профилях (all A/B и одиночные переключения); это регрессия совместимости, не независимая научная проверка TKI. Удаленный CI проверяется отдельно перед merge.

npm registry/lock review: 65 пакетов, только MIT/BSD-3-Clause/ISC/Apache-2.0, все resolved официального registry и SHA-512 integrity, нет install scripts. npm audit — 0 известных advisories. CI сохраняет Node22/24, audit, history secret scan и Required checks; добавлен typecheck, lock policy и build.

## Границы приемки

Async ports сейчас интерфейсы, не реализация транзакций/авторизации. Новый HTTP каркас не заменяет pilot и не читает базу. PG adapter/schema/RLS, concurrency, snapshot migration/restore и сквозной HTTP сценарий — 02г–02з. О real запуске, оплате, provider и несовершеннолетних решения не подменяются каркасом. Branch protection остается ограничена тарифом; каждый разрешенный merge проверяется вручную по актуальным jobs.
