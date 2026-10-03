# Зависимости, архитектурные проверки и безопасность

## Фаза3 — подтвержденный текущий результат

03а–03з интегрированы#16–#23, head50ad6c7b/run37140560958 все6jobs success:195base наNode22/24+80actual PG18.6/Chrome,0fail/skip. Нет новых npm пакетов, manifest/lock exact dependencies прежние65. Browser preinstalled official runner, no additional downloads; ephemeral CI profile/downloads не upload artifacts. `--no-sandbox` только ephemeral synthetic Linux Chrome, не server/security setting. Secretscan fullhistory redacted, dependencyaudit high/critical блокируетCI, architectureAST/layer/package/artifact checks и strict TS проходят. Это не independent pentest/sourceaudit или scientific/production proof.

Account security: current server realm/version/user/membership, salted scrypt/admission/durable throttle, password pending≠staff, actualTOTP/replay/fail/expiry/recovery, AES256GCM sealedfactor/externalkey, HttpOnlyStrict/HTTPSHost cookies/same-origin/CSRF/bodylimits/CSP/no-store/no-referrer. Management/export повторяют freshproof/authority underlocks+mandatorymeta audit, rollback failures, immutablediagnostics. Library/processing/sql/signup/resetbypass не включены. Server branch protection тарифно недоступен, ручной currenthead/all6jobs/base/tree/hash/diff gate выполнялся перед каждымmerge. Local4175 UI503; realdata/Selectel/paid/publication не выполнялись. Ограничения/keycustody/release/privacy —PHASE3_ACCEPTANCE.

Дата:2026-10-03. Область: TKI-пилот и завершенная фаза2; подготовительная история сохранена ниже. Фактический результат —PHASE2_ACCEPTANCE/STATUS: финальный head5b42cce7/run37130462614 все6jobs success,179base+38PG18.6,0errors/skip. Это не server branch protection, независимый security аудит или production deployment.

## Зависимости и обновления

### Реестр 02в (2026-10-03)

| Пакет | Точная версия / лицензия | Назначение и альтернатива |
|---|---|---|
| fastify | 5.12.5 / MIT | HTTP + schema/serialization/inject tests; вместо собственного расширения node:http |
| pg | 8.23.1 / MIT | Следующий PG adapter, явные параметризованные транзакции; вместо ORM/нативного драйвера |
| typescript | 6.0.3 / Apache-2.0, dev | Strict build/typecheck и JS/TS compiler AST; вместо дополнительного parser/runtime loader |
| @types/node | 22.20.5 / MIT, dev | Типы нижней поддержанной CI-линии |
| @types/pg | 8.23.1 / MIT, dev | Типы драйвера, не runtime package |

Прямые версии/лицензии получены из первичного npm registry; дерево lockfile содержит 65 пакетов, MIT/BSD-3-Clause/ISC/Apache-2.0, все resolved registry.npmjs.org, SHA-512 integrity, install scripts отсутствуют. `check:dependencies` автоматически проверяет эти условия, точные версии и manifest/lock consistency; high/critical audit по-прежнему блокирует CI. Локально npm audit дал 0 известных advisories для этого дерева. Это не полная проверка исходников зависимостей. TypeScript 6 выбран для compiler API, не вслепую latest 7 native compiler. `pg` используется реальными synthetic UnitOfWork/auth/import/restore/API tests; Windows без PG/Docker не объявляется local engine proof.

Поддержка/основания: [Fastify LTS](https://fastify.dev/docs/latest/Reference/LTS/), [транзакции pg](https://node-postgres.com/features/transactions), [TypeScript options](https://www.typescriptlang.org/docs/handbook/compiler-options.html), [registry Fastify](https://registry.npmjs.org/fastify/5.12.5), [registry pg](https://registry.npmjs.org/pg/8.23.1), [registry TS6](https://registry.npmjs.org/typescript/6.0.3). Перед real deployment повторить проверку текущих Node patches и всего дерева. Историческая таблица ниже описывает подготовку, не текущий пакетный состав.

В02в regex-извлечение заменено compiler AST:literal CommonJS/ESM imports,exports/import types,TS `.js` resolution,cycles/src layers. Computed loaders/require aliases блокируются. CI выполняетstrict typecheck/build, dist запрещен вGit. Guard не полный SAST; реальные DTO/auth/DB/CAS/revoke/rollback/restore/API проверены в02г–02з. Health не раскрывает данные, loggeroff, synthetic bootstraploopback;4173 не переключен. Ниже исторический реестр подготовки до установки пакетов.

| Компонент | Зафиксировано сейчас | Контроль |
|---|---|---|
| npm runtime/dev packages | 0 внешних пакетов, package-lock.json | npm ci с отключенными lifecycle scripts, npm audit, dependency-policy.json |
| Node.js | Локально 22.17.1; CI latest patch 22/24; целевой сервер 24 LTS | Номер фактической версии в CI, обновления безопасности, проверка LTS перед выпуском |
| actions/checkout | v7.0.1, SHA 3d3c42e5aac5ba805825da76410c181273ba90b1 | SHA проверен по official tag; Dependabot |
| actions/setup-node | v7.0.0, SHA 820762786026740c76f36085b0efc47a31fe5020 | SHA проверен по official tag; автоматический cache отключен |
| Gitleaks CLI | 8.30.1, Linux x64 SHA-256 551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb | Release asset digest проверен через GitHub; бинарник проверяется перед запуском, вывод полностью редактируется |
| Будущие Fastify/pg/TypeScript и их дерево | Еще не установлены | Назначение, лицензия, поддержка/advisories, точная версия/lockfile и проверка транзитивных зависимостей в 02в |

Новый пакет добавляется вместе с записью цели/альтернатив/лицензии/поддержки и изменением approvedNpmPackages; пакет в devDependencies не становится разрешенным runtime import. Lockfile обязателен, ссылки на произвольные Git/HTTP-архивы и install scripts требуют отдельного технического обоснования. `npm audit` проверяет известные advisories; ноль находок при нуле пакетов не означает безопасность Node, приложения или Actions.

Dependabot предлагает отдельные небольшие PR для npm и GitHub Actions еженедельно, максимум по три. Major-обновления проходят оценку совместимости; версии не повышаются вслепую. Gitleaks CLI не обновляется Dependabot автоматически: его tag/checksum проверяются при обслуживании безопасности и изменении CI. Если источник проверки уязвимостей недоступен, проверка не превращается в success.

## Автоматические проверки

В 02д добавлен обязательный job `PostgreSQL 18 isolation`: postgres18.6-bookworm@sha256:3725f4e2499eef5134592b3b4ab79a543ed7f8e533b05b5b637af926630f6650, Node24, fresh synthetic DB/runtime roles. Required checks также требует его success, не skipped. Docker Hub digest и [поддержка Selectel](https://docs.selectel.ru/managed-databases/postgresql/configurations/) сверены 2026-10-03; текущая [PG версия](https://www.postgresql.org/support/versioning/)18.6. Credentials/runtime passwords генерируются в памяти, нет deployment secrets/artifact dumps. Container trust ограничен одноразовым loopback CI job; deployment эту настройку не получает. Локально PG тесты не пропускаются со статусом success: `test:pg` требует явного PEDPSY_PG_TEST и локального host/port, иначе fail.

Runtime PG role: точечные SELECT/INSERT/column UPDATE grants, нет DDL/ownership/BYPASSRLS/role creation или прямого SELECT auth. Fixed SECURITY DEFINER functions owned by separate migrator используют owner bypass для auth metadata; FORCE RLS не включен во избежание рекурсии, но runtime никогда не owner. Actor выводится из действующей hashed session и серверной MFA proof, не role GUC. Прямые SQL/RLS tests проверяют own/global staff read/no staff write/unknown role/empty context/pooled context/revoke. Общая инструкция postgres-best-practices использована для минимальных grants, FK indexes, транзакционного контекста и разделения ролей; Supabase service не подключен.

`.github/workflows/ci.yml`: pull_request в main, push в main, еженедельная проверка main по понедельникам 04:17 UTC и ручной запуск после появления workflow в main. Расписание и Dependabot version updates начнут действовать после включения конфигурации в main; проверки PR уже реально выполнены. Нет фильтра путей, пропускающего проверки документационных PR; тестируется общий checkout PR, а не только head в отрыве от main.

| Job / команда | Что проверяется | Что этим не доказано |
|---|---|---|
| Tests (Node 22), Tests (Node 24) | npm ci, границы модулей/пакетов/артефактов, node --check, все тесты | Реальное размещение, научная валидность, полная межбраузерная матрица |
| Dependency audit | npm audit всего lockfile; high/critical блокируют | Неизвестные уязвимости и безопасность собственного кода |
| Secret scan | Gitleaks всей доступной Git-истории с fetch-depth:0, --redact=100 | Поиск всех персональных данных и всех возможных секретов |
| PostgreSQL18 isolation | Runtime RLS/ACL, contracts/CAS/locks/revoke/audit, domain import/pg_dump restore и actual HTTP/API | Production RPO/RTO/нагрузка, научная валидность и готовый staff MFA enrollment |
| Required checks | Успех всех перечисленных jobs; failure/cancelled/skipped блокируют | Серверное применение требования к merge, пока не включена защита main |

Workflow имеет только contents:read, Actions закреплены полным SHA, checkout не сохраняет credentials. Нет pull_request_target, production secrets, выгрузок базы или автоматического деплоя. Сканер не отправляет исходники внешнему SaaS. Ограничены время и параллельные запуски. Синтетические тесты создают временные базы и используют loopback; основной файл .local не загружается.

`scripts/check-architecture.js` выполняет compiler AST анализ JS/TS: core не зависит от I/O/БД/web/packages; чистыеports/application не имеют I/O; HTTP не импортируетDB/adapters;storage не зависит отweb;cycles/computedloading/requirealiases/dev-onlyruntimeimports и опасныеGitartifacts блокируются. CI требуетcheckout, local без.git явно обозначен. Это регрессионный guard принятыхграниц, не полныйSAST; malicious execution/network/security proof им не заменяется.

Participant auth004 дает ограниченные backend-only lookup/issue/revoke/throttle/denialfunctions, не directSELECTauth и не клиентскийSQL. Secrets/serverrole довереныBFF; RLS не защищает от произвольного кода с украденнымиDBcredentials. Fixed search_path/PUBLICrevoke/minimalgrants, privilegechecks, opaquehash,currentstatus/version/time иscope rechecks остаются обязательными. PostgreSQL schema tests вместе с API подтверждают обе validMFAstaff globalread, participantownwrites, no staff impersonation. РеальнаяMFAsetup/step-up/recovery—фаза3. SQL/HTTP ошибок/секретов вответах/logs нет;metadataauditfailclose.

Guard проверен отрицательными примерами: core→storage/network, storage→web, цикл, computed loading, отсутствующий файл, необъявленный пакет, .env/SQLite/выгрузка. Разрешены node:sqlite в storage и комментарий про import-adapter; проверена совместимость с действующим пилотом.

## Настройки GitHub и merge

На старте ветка main не защищена, .github/workflows отсутствовали. Подготовка добавляет workflow, Dependabot и шаблон PR в ветке от main. Правила ветки — настройки GitHub, их нельзя включить одним YAML. Проверка `/repos/PedFund/PedPsyRU/rulesets` вернула **403: Upgrade to GitHub Pro or make this repository public to enable this feature**. Поэтому серверная защита этого частного репозитория сейчас недоступна на текущем тарифе. Доступный connector также не предоставляет запись правил. Подписка и видимость не менялись; активация не объявляется выполненной.

После успешного первого запуска включить правило main (если тариф частного репозитория поддерживает): PR обязателен; обязательный status context `Required checks`; ветка актуальна относительно main; запрет force push/удаления; обсуждения разрешены; bypass не используется для обычного merge. Не требовать обязательного одобрения вторым разработчиком, которого нет: технический review и проверки фиксируются в PR, владелец подтверждает только вопросы за пределами согласованного.

Если GitHub не позволяет включить нужное правило без изменения тарифа, не оплачивать автоматически. До включения защиты следующая модель применяет те же критерии вручную перед каждым разрешенным merge: текущий head, актуальная main, все jobs успешны, отсутствие конфликтов/других непринятых зависимостей, просмотр diff прав/ключей/миграций и отсутствие данных/секретов. Это организационный контроль, не эквивалент серверной защите ветки; ограничение сохраняется в STATUS.

CodeQL/dependency-review для private репозитория могут требовать GitHub Code Security/Advanced Security; платные возможности не считаются включенными. Базовые проверки работают без этих функций. Следующая модель выбирает дополнительный локальный SAST и проверку YAML Actions при расширении API/CI; перед реальным набором требуется отдельная проверка безопасности. Основания: [dependency review](https://docs.github.com/en/code-security/concepts/supply-chain-security/dependency-review), [безопасность Actions](https://docs.github.com/en/actions/reference/security/secure-use), [Gitleaks](https://github.com/gitleaks/gitleaks/tree/v8.30.1).

## Архитектурная безопасность: приемочные сценарии следующих задач

| Угроза / ошибка | Обязательный результат проверки |
|---|---|
| Подмена study/participant/attempt ID, role/header/cookie | Одинаковый отказ для чужой и отсутствующей записи; нет признаков существования, ответа или балла |
| Исследователь вызывает admin/result/export URL | Нет индивидуальных ответов, результатов, контактов или повышенных прав |
| Администратор вызывает process/method/publish/role API | Нет обработки/редактирования методик и выдачи административной роли |
| Суперадмин запускает ручной повтор | Только разрешенный тип операции, reason/audit, pinned snapshot, новый run при пересчете, без перезаписи исходного результата |
| Потеря ответа/дублированный запрос/два worker | Одна фиксация по idempotency key, старый completed возвращается повторно, письмо не дублируется бесконечно |
| Отзыв прав/закрытие исследования во время записи | Проверка прав согласована с транзакцией; нет поздней записи отозванной сессией |
| Ошибка БД/обязательного аудита | Полный rollback и отсутствие преждевременного сообщения об успехе |
| Утечка контекста пула/RLS bypass | Следующий запрос другого участника не наследует доступ; runtime DB role не owner/superuser/BYPASSRLS |
| Фильтры/малые группы/дополняющие итоги | N≥10 по каждой выданной шкале/ячейке; подавление и защита разностей; экспорт равен по правам интерфейсу |
| Подмена выпуска/ключа, произвольный код в методике | Проверка versions/digest/schema; обработчики из проверенного кода, не eval клиента |
| CSRF/XSS/injection/большой запрос | Серверные Origin/CSRF, escaping/CSP, параметризованный SQL, лимиты/timeout, безопасные ошибки |
| MFA/recovery/смена роли | Недостаточно одного пароля админа; step-up для чувствительных операций, отзыв сессий, нет самоповышения и блокировки последнего суперадмина |
| Почта/логи/CI/artifacts | Нет ответов, баллов, паспортов, токенов и реальных email участников; уведомление ведет к обычному входу |
| Backup/restore и потеря инфраструктуры | Восстановление в отдельном контуре, проверка digest/версий/FK, доступ по назначению и утвержденным срокам |

Положительные тесты обязательны рядом с отрицательными: обе административные роли действительно читают/скачивают разрешенное; только суперадмин управляет обработкой; участник возвращается к тому же черновику/результату. Доступ проверяется прямым API/SQL под runtime ролью, не наличием кнопки.

## Работа с находками

Первый фактический GitHub scan остановил допуск из-за трех `generic-api-key` совпадений в историческом core/tki-contract.js. Сверены исходники указанных коммитов/строк: это константы SHA-256 диагностического ключа (`KEY_DIGEST` и исторический `LEGACY_KEY_DIGEST`), не API credentials. В `.gitleaksignore` внесены ровно три fingerprint commit:path:rule:line; файлы, правила и другие значения не исключены. Старый ошибочный расчетный ключ не восстанавливается. Контрольный [запуск 37112547100](https://github.com/PedFund/PedPsyRU/actions/runs/37112547100) на head b6fe88cbbec1bb64c35ad9141887c2a52783dbbd полностью прошел, включая Secret scan. При последующих изменениях проверяется новый head.

Сначала воспроизвести и определить затронутую область. High/critical зависимости, секрет в Git, нарушение прав, повреждение данных, неподтвержденная математика или падающий обязательный job блокируют merge соответствующего изменения. Не добавлять continue-on-error/широкие исключения ради зеленого статуса. Тестовый false positive оформлять точечным исключением с причиной, не отключением сканирования. При реальном секрете прекратить распространение, отозвать/заменить его; переписывание истории не выполнять без отдельного решения владельца.

Новые данные, новые права, новые методики, оплата и публикация требуют решения владельца. В этой сессии решения о правах зафиксированы в PHASE2_DESIGN; их реализация далее допустима в согласованной матрице. Нереализованный endpoint не объявлять защищенным только по этому документу.
