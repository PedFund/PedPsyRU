# 05ж.1 — локальный QR группового приглашения

## Область и зависимости, 2026-10-07

От принятого PR #50: main `ae2fd073860b2540ad2f1ee7fc1ba3e8c603fa08`,
head `f16d704c3d57bb23083dabab531b1ca734bd9868`, tree
`cd62f3b1d4db86bd7d3bdb642db2a317701cc9ef`.
[Run 37312700977](https://github.com/PedFund/PedPsyRU/actions/runs/37312700977):
все шесть jobs success; 308/308 Node22 и Node24; 294/294 actual PG18.6;
три дополнительных Chrome runs по5/5. Fail/cancel/skip=0.
Currentbase/source/preview/parents/all311blobs/292unchangedbase/44unchangedcritical
+ единственное точное workflow15→20min исключение проверены; actualmain после
ordinarymerge совпал по parents/tree/all311. Это принятый UI, не real pilot.

QR — отдельный небольшой технический блок; не новая методика или право.
`qrcode-generator` **2.0.4**, MIT, без runtime dependencies и install scripts;
официальный npm metadata и lock SHA512 сверены:
`sha512-mZSiP6RnbHl4xL2Ap5HfkjLnmxfKcPWpWe/c+5XxCuetEenqmNFf1FH/ftXPCtFG5/TDobjsjz6sSNL0Sr8Z9g==`.
Установка `--ignore-scripts`; npm audit:0 уязвимостей. Пакет и policy exact pinned.
Источник/полное MIT notice — THIRD_PARTY_NOTICES.md; исходный header сохранён.
Статический scan dist/qrcode.js не нашёл сетевых/storage/eval API; это не
заявление о независимом полном security audit библиотеки.

Изменение критических package.json/package-lock.json явно разрешено целью
dependency-reviewed QR; единственная новая lock запись — этот пакет. Другие
версии/integrity/SQL001–030/core/scoring/releases/workflow/ownerstand/MFA неизменны.
Архитектурный scanner не ослаблен: bootstrap читает конкретный установленный
dist asset; HTTP не импортирует библиотеку, pure scientific слои не зависят от неё.

## Контракт и защита

Одноимённый локальный `/workspace/qr.js` содержит pinned encoder и wrapper.
Без CDN, API QR, внешних запросов, image data URLs, local/sessionStorage,
PII/logging/token text внутри SVG. Existing CSP `script-src 'self'` без unsafe
directives сохранён. SVG DOM только из boolean modules, integers, fixed attributes;
четыре белых quiet-zone модуля, Byte encoding, auto size, correction M.
Вход — точный canonical same-origin HTTP(S) `/workspace#join=<43base64url>`,
<=512 ASCII bytes, без query/userinfo/произвольного пути/другого origin.
Подпись ссылки остаётся обычным readonly полем, даже при недоступности QR.
QR очищается вместе со ссылкой при hide, reread, смене группы/дизайна, logout
и pagehide. Сохранённая человеком картинка — копия invite secret, не вход или
обход server expiry/revoke/group/email/password/consent/MFA guards.
Для другого устройства loopback127.0.0.1 не маршрутизируется на компьютер;
доступ по сети/hosting сейчас не включаются.

## Проверка и честные пределы

Пять new units: deterministic golden matrix (не independent decoder), exact
payload/correction, deny-before-encoder, pinned metadata/integrity/no scripts,
same-origin asset/copyright/CSP. Первая адресная проверка4/5: тест пытался
require package.json subpath, запрещённый exports. Исправлен только чтением
установленного metadata по resolved dist path; повтор5/5. Первый architecture
check отказал require.resolve production indirection; scanner сохранён,
bootstrap использует точный фиксированный asset path. Это не ослабление guards.
Full313/313 до исправления bootstrap path и финальный full313/313 после него
прошли, fail/cancel/skip=0; architecture scanner после исправления прошёл.
Build/types/syntax/dependency policy/audit прошли; actual Chrome QR assertions
написаны (в прежнем сценарии researcher): exact generated path, quiet zone,
hide/reread secret+SVG clearing и storage0. Сценариев PG по-прежнему294;
browserfile5×3 независимых повторов. Локально PG/Chrome не исполняются.

Нужен current-head all-six/actual294PG/threeextraChrome5/5/freshbase/source/
preview/parents/manifests/critical сохранность до ordinarymerge. Проверка SVG
не выдаётся за сканирование реальным Android или независимое decoding;
такое ручное usability QA остаётся ограничением, не имитацией test success.
После accepted QR —05з техническая приёмка всей фазы5; не phase6/realmail/
Selectel/новые права/science/перезапуск локального ownerstand.

Предыдущая пауза Oct5: automatic approval reviewer usage limit остановил
readonly npm metadata, действие не исполнилось. Oct7 обычная повторная approval
проверка разрешила metadata/install/audit; обхода approval не было.
