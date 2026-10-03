# Фаза 4 — техническая приёмка конструктора

Дата2026-10-03. Поручены04а–04з; фаза5 не начинается автоматически. Сейчас04а–04ж в main,04з —кандидат расширенной приёмки. Только synthetic development, Selectel отложен.

## Фактическая интеграция и CI

|Задача|PR / head|Успешный run|Base / PostgreSQL|
|---|---|---|---|
|04а создание|#25 / e51bfc88|37144756732|196 / 84|
|04б группы|#26 / 67c0681a|37145236483|197 / 85|
|04в этапы|#27 / dc7cb07e|37145591825|198 / 86|
|04г назначения|#28 / b9a81b70|37146059055|199 / 87|
|04д копирование|#29 / 0f07984e|37146675781|200 / 88|
|04е lifecycle/quota|#30 / c64c8115|37147127875|201 / 90|
|04ж интерфейс|#31 / f8122a15|[37147500255](https://github.com/PedFund/PedPsyRU/actions/runs/37147500255)|202 / 95|

Каждый currenthead прошёл все6jobs: Tests Node22/24, Dependency audit, Secret scan, PostgreSQL18 isolation, Required checks. PG18.6 выполняет real SQL/HTTP/Chrome в disposable DB,0fail/skip. Дополнительно три независимые browser runs (после04ж по2scenarios каждый), не прибавляются к95distinct tests. Freshmain/base/head/preview/fullmanifest/core hashes проверены до ordinary merge, actualtree/parents после. Новая задача от актуальной main, не цепочка открытых PR.

## Кандидат 04з

Первый currenthead #32/2c3c9595/[run37148721269](https://github.com/PedFund/PedPsyRU/actions/runs/37148721269): все6jobs completed/success,202base+101/101PG18.6, три дополнительные browser runs по2/2,0fail/cancel/skip. Шесть новых negative scenarios фактически приняты. Следующие strictkind/018 code-review изменения проходят новый полный gate; прежний success не доказывает их готовности.

Локально202/202base, strict build/typecheck/architecture/dependency/syntax success. Добавлены6actual PG-сценариев, ожидается101PG, **пока не подтверждено CI**: credential/membership revoke во время ожидания locks; caps50/50/500 и version saturation rollback; fake release/malformed sets; lifecycle audit rollback/quota/idempotency; все frozen configuration routes/private helpers. Завершение только после актуального all6CI и ordinary merge.

Code review отдельно устранила application `String(kind)` coercion: array/null/object отвергаются как400 до adapter; прежний SQL enum gate оставлен. Pure/actual HTTP tests усилены в существующих scenarios, числа tests не увеличиваются. Это строгость входа, не изменение прав/методики.

Append-only018 также закрывает directory count→list race: LIMIT501/count/aggregate в одном SQL/MVCC snapshot, exact500success/501refusal проверяются HTTP.017 сохранена, fixed authority/audit прежние. Это code-review исправление, а не заявление о воспроизведённой утечке или ослабление тестов.

## Действия и границы

Researcher через браузер создаёт свой draft/КГ/ЭГ/other/T0–T2/custom/independent group×stage sets, копирует настройки, меняет title, активирует/закрывает. Both staff global read-only дизайн; их raw/stored result read/download прежние. Researcher individual diagnostics не получает. New methods/editor/processing/manual SQL/staff designer/quota override не добавлены.

Atomic save = current authority underlocks + CAS + DML/version + required audit + bounded metadata + named policy + COMMIT. Two tabs не перезаписывают друг друга, uncertain save требует explicit reload. Copy не переносит людей/ответы/баллы. Active quota default1 только activation, drafts/closed не расходуют. Все настройки до activation; active/closed/attempt-bearing frozen, closed не reopen. Technicalcaps —CONSTRUCTOR_VALIDATION.

## Регрессии и ограничения

Первый #25/run37144352030:80/83PG,3snapshot regressions из-за design_version; merge остановлен. Исправлен format2/legacy1 zero target check/nonzero7 roundtrip, backup restore снова passed, не ослаблены tests. Scientific core/key/form/processor, PG001–010/SQLite migrations и npm manifest/lock/workflow unchanged.

Полный TKI package научно **draft**, key_verified; technicalallowlist не scientific publication. Успешный код не доказывает валидность методики. Passport/consents/participant invites —фаза5, method library/editor —фаза6; aggregates≥10/anti-differencing/help signals/email/outbox/jobs будущие. Co-ownership/quota override/active revisions не реализованы.

Local4175 UI/API503: browser проверил новую фазу и явное отсутствие PostgreSQL, не локальное сохранение. Full4174 flow вCI, local PG/Docker отсутствуют; старый4173/SQLite не переключён. Selectel/paid/publication/realaccounts/data не выполнялись. Не заявлены independent pentest/scientific/legal/production acceptance. Before realdata отдельно minors/consents/purpose/retention/operator contracts/keycustody/deployment.

Local folder без `.git`, clean working branch не заявляется. Результаты сохранены локально, refs/manifest сверяются connector. Force push/hard reset/deletion/massPRmerge не применяются.
