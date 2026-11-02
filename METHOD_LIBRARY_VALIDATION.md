# Фаза6: технический журнал библиотеки методик

## 2026-10-29: PRFQ-RU-16 доступна в локальном учебном кабинете

В рамках запроса владельца подключить все методики из исходной библиотеки выполнен первый дополнительный выпуск: PRFQ-RU-16 (родительское рефлексивное функционирование). Форма из первой строки принадлежащего владельцу XLSX; 16 вопросов, семь вариантов, три шкалы и реверс пункта11 сверены с первичной публикацией [Камской и соавторов (2023)](https://psyjournals.ru/journals/jmfp/archive/2023_n3/Kamskaya_et_al). Обработчик возвращает по каждой шкале среднее, станайн и уровень по исходному процессору; общего балла нет. Запись учебная, draft/legacy_checked, применимость нормативов и права не объявлены утверждёнными. Для ПСС и мотивации родительства пользователю направлен вопрос об отсутствующих ключах; MAAS по прежнему указанию отложена.

Миграция037 добавляет только точный закреплённый выпуск; данные других методик не допускаются под его идентичностью. Исследователь видит название, авторов, показатели и может назначить методику. Синтетический участник может пройти 16 вопросов, сохранить и продолжить ответы и получить результат. До обновления стенда выполнен проверенный pg_dump; отпечатки существующих пользователей/исследований/ответов совпали, импорт повторён без дублей. После перезапуска проверены health, закрытая граница авторизации, три разрешённых выпуска и сохранность всех50 записей/63 хэшей.

371/371 локальных тестов, build/types/architecture/syntax/dependencies, 7/7 актуальных PostgreSQL сценариев PRFQ/Карпов/библиотека и 3/3 pg_dump/pg_restore/upgrade, полное браузерное прохождение PRFQ в отдельной тестовой БД (после проверки удалена); подтверждён результат для 16 ответов 4: шкалы 4/4/4, станайны 8/5/2. Новый полный current-head PostgreSQL/Chrome/GitHub CI не заявляется. Остальные методики ещё не стали назначаемыми: цель владельца остаётся в работе; ранее восстановлены 13 форм из первой строки его таблиц без переноса ответов. Дальше подключать следующие проверенные бланки/ключи и расширить действующий online-адаптер для длинных опросников и разных вариантов ответа, не ослабляя закрепление выпусков/права и не смешивая версии.


## 2026-10-29: расширяемые модули и учебное прохождение Карпова

По решению владельца методики не ограничиваются заранее заданными четырьмя типами. Новый [METHOD_EXTENSION_CONTRACT.md](METHOD_EXTENSION_CONTRACT.md) описывает versioned module runtime, JSON-ответы/состояние/результат произвольной формы, отдельные экраны и индивидуальные проверки/обработчики, включая возможность ручной оценки. ТКИ и Карпов используют общий реестр, а для необычных форм предусмотрено отдельное подключение. Открытый программный контракт не означает, что уже реализованы универсальный импорт, онлайн-прохождение всех 50 методик, медиа, таймеры, ветвление или экспертный интерфейс: новый формат требует своего экрана и адаптеров хранения/HTTP. Текущий SQL participant-контур по-прежнему закреплён за двумя выпусками и одиночным выбором; научное утверждение и права отдельно.

Карпов подключён в локальном учебном контуре: 27 пунктов, семь ответов, общий балл/стен/уровень по исходному владельческому процессору; нормы и инструкция остаются не утверждёнными, выпуск draft/legacy_checked. В локальном стенде перед миграцией036 выполнен pg_dump с проверкой pg_restore --list, fingerprints пользователей/исследований/ответов до и после совпали; импорт выполнен дважды без дублей. После перезапуска проверены health, закрытая граница авторизации, 50 архивных описаний и 63 хэша, два доступных выпуска и 27 пунктов Карпова. MAAS пользователь отложил до конца.

Проверены 368/368 локальных тестов, сборка/типы/архитектура/синтаксис/зависимости, 10/10 адресных PostgreSQL API/ТКИ/Карпов и 29/29 consent/admission с реальными локальными pg_dump/pg_restore. В браузере на отдельной вымышленной БД пройдены все27 вопросов, проверены перечитывание и результат 108/3/низкий; тестовая БД и роль удалены. Первоначальный полный локальный прогон PostgreSQL обнаружил утечку лишних полей формы ТКИ и занятый порт теста — оба исправлены и повторно проверены; часть прежних backup-тестов требовала Docker, для этого Windows-стенда добавлен строго ограниченный транспорт только к временным тестовым БД. Проверка временной метки использует часы PostgreSQL без ослабления границ. Широкий PostgreSQL прогон, начатый до исправлений, завершился 292/303: шесть обнаруженных проблем затем повторно проверены успешно, пять browser-сценариев не запустились из-за занятого рабочим кабинетом порта 4174; полная повторная браузерная приёмка не заявляется. Отдельно браузерное учебное прохождение Карпова выполнено успешно; current-head GitHub CI/Node24 не запускались, публикация/merge не выполнялись.


## 2026-10-29: перенос полной исходной библиотеки и результатов

По новому поручению владельца использована папка существующего МетодТестПроцессора на диске P:. Перенесены50 определений методик (24+12+14),63 исходных файла и422 названия выходных полей. Архив содержит фактические ключи, таблицы преобразования, описания, исходный код как текст и синтетические контрольные примеры. Никаких Data/XLSX с респондентами, node_modules, конфигураций или секретов. Действующие core/форма/исправленный ключ ТКИ не заменены архивным вариантом.

Миграция035 добавляет отдельные immutable/RLS таблицы legacy_method_sources/legacy_method_versions и guarded metadata-only GET catalogue для researcher/staff. Явный owner-only локальный импорт проверяет hashes/размеры/пути и повторяется без дублей; веб-сервер не исполняет архивный JS. Архив не считается approved online release. Источник больше не нужен на P: для запуска или импорта, материалы и PostgreSQL переносимы вместе с проектом.

В кабинете исследования доступен просмотр всей библиотеки для планирования: автор (при наличии), число пунктов, показатели, субшкалы, все формы результата; поиск по ним с поддержкой тревоги/тревожности. Нормативные преобразования не названы дополнительными содержательными шкалами. По умолчанию список назначения по-прежнему ограничен разрешёнными выпусками; просмотр работает и при закреплённом дизайне, без права его редактировать. 48 исходных обработчиков и две заблокированные формы не означают48 готовых онлайн-прохождений: новое clinical dispatch/полные бланки остальных методик ещё не подключены. Карпов имеет сохранённые27 owner-supplied текстов, исходный общий балл/стен/уровень, но пока не разрешённый онлайн-релиз. Отдельных субшкал Карпову не добавлено.

Указанный владельцем psytests.org учтён как источник бланков. Подтверждён Карпов, найдены новые адреса ССПМ-2020/НТН/ВГРК; у MAAS три разные адаптации; владелец явно отложил её до конца. Массовое копирование полных чужих бланков/новое научное и правовое утверждение не выполнены. Полный перечень и пределы — METHOD_LIBRARY_TRANSFER.md.

358/358 локальных тестов, build/typecheck/architecture/syntax/dependencies;7/7 адресных actualPG18.6, затем3/3 с полным pg_dump/pg_restore всех50 записей/63 источников и совпадением byte hashes. Первый промежуточный restore-test ожидал одну новую миграцию, после добавления035 верное ожидание — две; зафиксирован и проверен повтором. Браузерно на отдельной disposable PostgreSQL проверены карточка Карпова и поиск тревожности; найденный пропуск «тревоги» исправлен и проверен. Полный новый participant E2E/current-head GitHub CI/Node24/fullPG не заявлены; merge/push не выполнялись.

Перед035 личный стенд скопирован pg_dump и проверен pg_restore --list; прежние study/account/answer fingerprints совпали. Импорт дважды, DB content всех50 и SHA всех63 повторно сверены, /health и authentication boundary подтверждены. Настоящие данные/учётная запись/почта/Selectel не менялись. Предыдущие записи ниже относятся к соответствующим этапам.


## 2026-10-29: локальная библиотека — 06б и чтение каталога

По новому поручению владельца продолжена существующая библиотека, без повторного сбора материалов. Миграция034 хранит неизменяемые версии пакетов и фактические байты артефактов, SHA256, доказательства проверки и причины блокировки. Обновление головы библиотеки использует CAS; доступ к частным черновикам требует methods.manage, действующего superadministrator и свежего MFA. Прямые права runtime на таблицы и внутренний импорт отсутствуют; штатные операции журналируются. Размеры, число версий и объём выдачи ограничены.

Добавлены подготовленные описания уже существующих материалов ТКИ1.0.0 и Карпова0.1.0, отдельный явный локальный импорт и GET API частной библиотеки/доступного каталога. Запускаемый код из пакетов не импортируется. ТКИ связывается только с уже разрешённым instrument_release и точной проверенной версией обработчика. Карпов остаётся unsupported/draft вне исследовательского выбора: полная авторская инструкция, независимая проверка ключа, научное и правовое утверждение ещё нужны. Инвентарные50 обработчиков не стали50 доступными методиками; нового научного допуска нет.

Кабинет получает название, авторов, показатели и поисковые слова из PostgreSQL вместо встроенного списка ТКИ. Публикация, редактор методик и HTTP загрузка пакетов в этот блок не входят. Следующий блок — управляемый редактор/импорт; затем отдельная проверка готовности каждой методики.

Проверки:355/355 локальных тестов, build/typecheck/architecture/syntax/dependencies;9/9 адресных actual PostgreSQL18.6 (библиотека, конструктор HTTP, кабинет), после последнего ограничения входных данных повторно3/3 библиотеки. Проверены конкурирующие версии, роли/MFA, откат при отказе обязательного аудита, закрытость Карпова, upgrade001–033→034 и полное pg_dump/pg_restore с совпадением байтов артефактов. Current-head GitHub CI, Node24, весь PG suite и новый браузерный E2E не выполнялись; допуска к merge нет.

На личном локальном стенде перед034 создана и проверена резервная копия; fingerprints прежних исследований, аккаунтов и ответов совпали после миграции. Импорт выполнен дважды без дублей, сервер перезапущен, /health отвечает ok. GitHub, Selectel, реальные почта и аккаунты не изменялись. Пароли/конфигурации/резервные копии не включаются в исходники. Старые записи о pending ниже — история соответствующих этапов.


## 2026-10-07: принятый draft Карпова и локальный06а.3

PR#55 ordinary mainbb2bb115245e0effaa13abbb410a130c09c125ef/head924764bf/run37603815117: all-six success,338baseNode22/24,294actualPG18.6,threeChrome5/5,0all. Freshbase/source/preview/334rawblobs/319unchanged/old45critical и actualmain/parents/tree/full334 verified;2newdraftJSON→47critical. Научный выпуск/нормы/primarykey/fullauthorinstruction/rights не утверждены.

[METHOD_HANDLER_VALIDATION.md](METHOD_HANDLER_VALIDATION.md) —06а.3 staticexistingTKI/form+key bytepins/schema/handler/exact3legacyvectors;8newgroups/address8/8/capturedfull346/346/build/types/architecture/syntax/deps passed. Firstfull344/346 twofailures retained (one fetch failed captured, second detail truncated), unchangedweb9/9/repeat346 passed; причина не объявлена исправленной. Current-head all-six/actual294PG/threeChrome/currentbase/preview/parents/fullmanifests gate pending. Positivehandler evidence не scientificapproval, publishablefalse и basis review required; unsupportedKarpov не зарегистрирован. All47critical/SQL/core/packages/workflow/ownerstand/MFA unchanged. Послеacceptance06бpersistence→API/editor.

## 2026-10-07:06а.2 в main; новые материалы Карпова06е.0

PR#54 accepted maindb37069509ad6db45fd6e9f576136a8fb023ef51/final7a99ea83/run37600160276 all-six success:332baseNode22/24,294actualPG18.6,триChrome5/5,0all; source/base/preview/parents/all329/314unchanged/all45critical и actualmain/tree/parents/all329 verified. Framework06а.3 staticruntime/vector verification и06бpersistence ещёне реализованы; не выдавать integrity за science.

Владелец прислал27утверждений/7labels Карпова и primarycitation, явно разрешил общую грамматику через/. [KARPOV_VALIDATION.md](KARPOV_VALIDATION.md): отдельныйsmall06е.0 draftform+rawkeyизexistingcode, source_text retained/2questions11+26 и6labelsedits/numeric1..7/orderunchanged. PrimaryURLtool403, fullauthorinstruction/independentkey-source/norms/rights approvalpending. RawfieldscopySHA4992123e/15direct12reverse; normsstenslevelsнеперенесены;5legacyvectorsнеindependentproof.6newgroups/full338local/build/types/architecture/syntax/depspassed0all; newcurrent-head all-six/294actualPG/threeChrome5/5/freshbase/source/preview/parents/manifests beforemerge. Existing45criticaluntouched+2newdraftJSON→47; no oldkeyrestoration/TKIchanges/clinicalregistration/permissions/SQL/packages/workflow/ownerstand/MFA/secrets change. Genericdraft validation+4artifact integrity acceptsstructure/bytes, publishablefalse/handler+source/instruction+rights/scientific/publicationblocked. Послеdraftmaterialgate continue06а.3 then06б; no automaticscientificpublication/realdata/mail/Selectel. Старыеpending statementsbelow historical.

## 06а.1 принят; текущий06а.2 — actual artifact integrity

PR#53 ordinarymain9a34cfbceb5a544276e47f9f68096600187e1bc9, final
0c905653ca2b4cde2e0da23d7c9e70fa910d5aee/tree5ce6aefc;
[run37597066870](https://github.com/PedFund/PedPsyRU/actions/runs/37597066870)
all-six success:324baseNode22/24,294actualPG18.6,триextraChrome5/5,0all.
Incomingmainafbf6b3d trafficinstruction preserved via ordinarytwo-parent sync;
thenexistingformcompatfix. Freshbase/sourceancestry/preview/parents/all324/
308unchangedbase/all45critical и actualpostmain/tree/parents/all324 verified.
Supersededcancelled37596037959/37596338453 NOTaccepted, retainedinPRbody.

Новый06а.2: trustedportreader+SHA256adapter+boundedscopedmemorystaging (notauth),
actuallength/hash/strictUTF8/ownedbyte snapshots/copyin-out/privateimmutablescope,
canonicalJSONv1packagefingerprint/deepfrozenmetadataevidence, neutral400mismatch/
503providererror. Nofiles/archives/network/eval/scoring/DB/HTTP/roles/approval.
Emptydraftnotverified; artifactsvalidbytes ≠ semanticform/key/right/scientific
validation. Handler/scientific/publication blockers remain+contentnotvalidated.
8newgroups passed locally, full332 expected; current-head allsix/actual294PG/
threeChrome5/5/freshbase/source/preview/parents/rawmanifest requiredbeforemerge.
All45critical/currentpackage/SQL/core/TKI/ownerstand/MFA preserved; nonewdeps.
Next06а.3 pinnedhandler/exactcurrentform-key/controlvectors, then06бpersistence.

## 06а.1 — metadata inventory и structural package contract, 2026-10-07

От accepted main29932a6781eebcc1bc696acf23fefad438ba96d5 /PR#52/run37591582200
all-six success:313base(Node22/24),294actualPG18.6,триextraChrome5/5,0all.
Владелец отдельно разрешил фазу6; это не scientific/publication approval.

METHOD_IMPORT_INVENTORY: actuallegacyregistry50 =24builtin+12standard+14tanit;
metadata-only, non-TKI inventory_only. Existing PedPsyRU TKI используется отдельно;
oldlegacykey не скопирован. Нет чтения реальных Excel/protocols/participantdata.

Pure typed submission1.0 validator/contract: exactJSON/bytes/depth/duplicatekeys/
UTF8/type/version/id/ref/path/media/digest syntax/finite bounds/caps; explicit
missingparts/normsabsence/rightsstatus/draft-onlyreview; synthetic vectors exact
own ordereditems/scales/sourcebasis. Deepfrozen outcome/publishablefalse/neutral
errors; no I/O/SQL/network/scoring/eval/auth claims/newdeps/HTTP/UI.

11 new test groups (many negative vectors per group) passed locally; numbers
count test groups, not individual mutations. Первый full324/324 passed0all.
Code review заменил regexp pre-scan на linear forward string scanner, чтобы
не повторять поиск closingquote на каждом escapedquote в malformed input;
added180KBunterminatedquote regression в том же test group/11of11 passed.
Это превентивное code-review исправление, не заявление о воспроизведённой
эксплуатации. Final full324/324/build/types/syntax/deps/architecture passed0all;
current-head all-six required beforemerge. Actual PG expectedunchanged294 and
threeChrome5/5: регрессии существующей платформы, НЕ новый library persistence/
HTTP/browser и НЕ научная проверка новых методик.

All45critical/core/TKI key+form/releases/SQL001–030/npm manifest+lock/workflow/
ownerstand/MFA/secrets unchanged. Source-only local folder without Git index;
beforemerge freshbase/source/preview/parents/fullrawblobs and actualpostmerge
verification. Historical scientific failures/statuses retained, no false approval.

Не решено этим блоком: actualartifact bytes/hash verification, handler static
allowlist/control-vector execution, trusted scientific/right review, immutable
library persistence/MFA/CAS/audit, API/editor and multi-method independent acceptance.
Послеaccepted06а.1 отдельный06а.2 trustedartifact/handler verification, затем06б.
При нехватке источников блокировать конкретный import, продолжать независимую
техническую библиотеку; не выполнять всю фазу как одно огромное задание.

### Совместимость existing TKI form и выбор владельца

Code review actual form.json выявила version0.1.0-draft; initial structural
formversion numeric-only её не принимал. Existing protectedform НЕ переименован:
формат form.version расширен только numeric x.y.z[-draft[.N]], без изменения
package/handler numeric-onlyversions, без неизвестных suffix/build/coercion.
Added exact existingformversion andbadversions regressions в прежней группе.
Это несовместимость нового контракта, не дефект/исправление научного TKI.
Нужен новый full current-head CI после изменения, прежний run не acceptance.

Владелец выбрал следующий реальный draft import: reflexivity_karpov_27
(рефлексивность Карпова,27вопросов). Выбор приоритета не scientificapproval,
не разрешение восстановить отсутствующие источники/форму/нормы догадками.
