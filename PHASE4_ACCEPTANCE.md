# Фаза 4 — техническая приёмка конструктора

Дата2026-10-03. Фаза4/04а–04з реализована и технически принята:8из8.04а–04ж main#25–#31,04з —PR#32 с обязательным final current-head CI/base/tree gate. Только synthetic development; Selectel отложен. Фаза5 автоматически не начинается.

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
|04з приёмка/исправления|#32 / e5b4a8b|[37149537791](https://github.com/PedFund/PedPsyRU/actions/runs/37149537791)|202 / 101|

Каждый currenthead прошёл все6jobs: Tests Node22/24, Dependency audit, Secret scan, PostgreSQL18 isolation, Required checks. PG18.6 выполняет real SQL/HTTP/Chrome в disposable DB,0fail/skip. Дополнительно три независимые browser runs (после04ж по2scenarios каждый), не прибавляются к95distinct tests. Freshmain/base/head/preview/fullmanifest/core hashes проверены до ordinary merge, actualtree/parents после. Новая задача от актуальной main, не цепочка открытых PR.

## Приёмка 04з и финальный gate

Первый currenthead #32/2c3c9595/[run37148721269](https://github.com/PedFund/PedPsyRU/actions/runs/37148721269): все6jobs completed/success,202base+101/101PG18.6, три дополнительные browser runs по2/2,0fail/cancel/skip. Шесть новых negative scenarios фактически приняты. Следующие strictkind/018 code-review изменения проходят новый полный gate; прежний success не доказывает их готовности.

Runtimehead e5b4a8b90ed64b6fbe56d187737cf58075802ddb/run37149537791:все6jobs success,202/202baseNode22/24+101/101actualPG18.6,0fail/cancel/skip;3/3дополнительных независимых Chrome runs по2/2. Все6negative scenarios, strictkind/018/exact500/501 и delayed-JS readiness фактически приняты. Локально202/202base/build/typecheck/architecture/dependencies/syntax success. Девять originalscientific blobs и контрольныйfixture, PG001–010/SQLite migrations/manifest/lock/workflow unchanged.192blobs local совпали с опубликованным runtime tree. Финальный commit только документационный, проходит тот же полный CI/current-head/base/preview/fullmanifest/actualmergeparents gate; прежний green не заменяет проверки нового head.

Code review отдельно устранила application `String(kind)` coercion: array/null/object отвергаются как400 до adapter; прежний SQL enum gate оставлен. Pure/actual HTTP tests усилены в существующих scenarios, числа tests не увеличиваются. Это строгость входа, не изменение прав/методики.

Append-only018 также закрывает directory count→list race: LIMIT501/count/aggregate в одном SQL/MVCC snapshot, exact500success/501refusal проверяются HTTP.017 сохранена, fixed authority/audit прежние. Это code-review исправление, а не заявление о воспроизведённой утечке или ослабление тестов.

## Действия и границы

Researcher через браузер создаёт свой draft/КГ/ЭГ/other/T0–T2/custom/independent group×stage sets, копирует настройки, меняет title, активирует/закрывает. Both staff global read-only дизайн; их raw/stored result read/download прежние. Researcher individual diagnostics не получает. New methods/editor/processing/manual SQL/staff designer/quota override не добавлены.

Atomic save = current authority underlocks + CAS + DML/version + required audit + bounded metadata + named policy + COMMIT. Two tabs не перезаписывают друг друга, uncertain save требует explicit reload. Copy не переносит людей/ответы/баллы. Active quota default1 только activation, drafts/closed не расходуют. Все настройки до activation; active/closed/attempt-bearing frozen, closed не reopen. Technicalcaps —CONSTRUCTOR_VALIDATION.

## Регрессии и ограничения

04з head1b39be7b/run37149104463:202base+101/101PG прошли, но первый дополнительный browser run1/2 failed на ожидании invite accepted. Merge остановлен, не hidden/skip. Точная причина без state stage ретроспективно не доказана; code review выявила enabled HTML-before-JS readiness gap. Login/accept теперь disabled до startup completion, auth forms POST, реальный app.js в constructor browser намеренно задержан250ms, safe stage label в timeout без values/secrets. Pagewait10s/все3runs неизменны. Новый head должен пройти полный CI; повторный успех не гарантия отсутствия flakes.

Первый #25/run37144352030:80/83PG,3snapshot regressions из-за design_version; merge остановлен. Исправлен format2/legacy1 zero target check/nonzero7 roundtrip, backup restore снова passed, не ослаблены tests. Scientific core/key/form/processor, PG001–010/SQLite migrations и npm manifest/lock/workflow unchanged.

Полный TKI package научно **draft**, key_verified; technicalallowlist не scientific publication. Успешный код не доказывает валидность методики. Passport/consents/participant invites —фаза5, method library/editor —фаза6; aggregates≥10/anti-differencing/help signals/email/outbox/jobs будущие. Co-ownership/quota override/active revisions не реализованы.

Local4175 UI/API503: browser проверил новую фазу и явное отсутствие PostgreSQL, не локальное сохранение. Full4174 flow вCI, local PG/Docker отсутствуют; старый4173/SQLite не переключён. Selectel/paid/publication/realaccounts/data не выполнялись. Не заявлены independent pentest/scientific/legal/production acceptance. Before realdata отдельно minors/consents/purpose/retention/operator contracts/keycustody/deployment.

Local folder без `.git`, clean working branch не заявляется. Результаты сохранены локально, refs/manifest сверяются connector. Force push/hard reset/deletion/massPRmerge не применяются.
