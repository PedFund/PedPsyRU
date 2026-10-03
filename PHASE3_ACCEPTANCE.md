# Фаза 3 — техническая приёмка аккаунтов и кабинетов

Дата2026-10-03. Только synthetic development, Selectel отложен владельцем.**03а–03з:8из8 интегрированы#16–#23.** Финальный merge b5c337572e7b108bf2bb9681133cf849a8126ae5; head50ad6c7b/[run37140560958](https://github.com/PedFund/PedPsyRU/actions/runs/37140560958) все6jobs success,195base(Node22/24)+80PG18.6,0fail/cancel/skip.174blobs/preview/parents сверены. Actual browser scenario прошел за3.75s, не skipped/mocked. Следующая фаза4 —конструктор, автоматически не начата.

## Проверяемые сценарии

| Блок | Подтверждение / граница |
|---|---|
|03а contracts/permissions|Названные операции/current server principal/свой scope, researcher realm без diagnostic RLS;7base+5PG|
|03б pending password|Durable throttle/salted scrypt/current version/status/locks; пароль не staff capability,6PG+1base|
|03в MFA/recovery|RFC HOTP/TOTP vectors/AES-GCM tamper; actual factor/enrollment/replay/expiry/one-use recovery/audit rollback,4base+8PG|
|03г researchers|Обе staff invite/block, one-use24h invite, separate researcher login/current membership/default quota1,7PG|
|03д roles|Только fresh super, self/last guard, version/session revoke; owner-only first synthetic bootstrap,6PG|
|03е diagnostics|Обе staff все исследования/raw+immutable stored result;500/4MiB/no truncation/self-consistent snapshot/required audit,6PG|
|03ж HTTP/UI|4HTTP boundary tests и3actual PG account HTTP flows,195base+79PG passed run37140067802|
|03з browser|Один обязательный Chrome test с actual PG/listen/cookies/UI/download; не mock DOM.80/80PG passed run37140560958,0fail/skip|

`tests/postgres-workspace-browser.integration.js`: две реальные password→MFA→recovery-confirmation роли, глобальные протоколы/5 сохраненных показателей, настоящее скачивание JSON и audit; reload/current session/logout/private DOM cleanup; admin без staff roles, invite/accept/researcher own home и отсутствие staff pane; hostile title отображается текстом; mobile390/desktop, JS не читает HttpOnly cookie, local/sessionStorage пусты. Browser fixture только Linux synthetic CI/loopback4174/одноразовый профиль, не пользовательский Windows browser. Отсутствие Chrome/PG **ошибка, не skip**. Используется уже установленный [Chrome официального runner](https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2404-Readme.md), [CDP Target](https://chromedevtools.github.io/devtools-protocol/tot/Target/) / [Runtime](https://chromedevtools.github.io/devtools-protocol/tot/Runtime/). Дополнительного npm пакета или browser download нет. `--no-sandbox` только ephemeral headless CI; не флаг сервера или схема production. Только test-owned temp профиль/выгрузка удаляются; наружу не публикуются.

Отрицательные HTTP/PG tests дополняют browser: wrong realm/client role/pending/revoked/expired/CSRF/Origin/media/bodylimit, неавторизованный export/role, fresh MFA, races/locks/version/rollback, immutable result и mandatory audit failure. Browser positive route не является единственным доказательством прав. Проверенный JS TKI/key/form не изменяются; новые scientific нормы/интерпретации не добавлены.195base включают прежние научно-технические контрольные примеры, но успешное выполнение не доказывает валидность методики.

## Что не готово и не запускалось

- Local4175 —UI-only503 без PostgreSQL; локального PG/Docker нет. Настоящий engine/browser проверен только GitHub ephemeral CI. Старый4173/SQLite не переключены.
- Public/real staff bootstrap/reset/выдача real accounts/персональные данные/операторские соглашения/minors/purpose/retention не выполнены. Password-only reset confirmed MFA не предусмотрен.
- Runtime external32byte MFA key обязателен, AES-GCM не заменяет production key custody/rotation/backup/recovery policy.
- Invite preview передается вручную; реальный email provider/уведомления не подключены. Политика neutral email signals принята, outbox/support/jobs позже.
- Редактор методик/пересчёт/manual jobs/обработка не включены даже суперадмину под видом существующего permission. Обе роли только immutable read/download и принятый account management.
- Research constructor/quota enforcement при создании —фаза4; N>=10/anti-differencing aggregates —отдельная analytics фаза, сейчас нет aggregate API.
- JSON export максимум500/4MiB целиком, без pagination/streaming/truncation; превышение требует отдельного протокола, не обхода лимита.
- Security/architecture/dependency CI не равны независимому pentest/scientific/production acceptance. Приватный тариф не позволяет server branch protection; head/all jobs/base/tree/diff вручную проверяются перед разрешенным merge, без покупки/публикации.

## Интеграция

Первый повторный CI финального documentary headff98b5b8/run37141248193 получил79/80PG: browser command timeout, прочие195base/security/dependencies success. Merge остановлен, scenario не skipped. Safe diagnostics labels/method без params/secrets добавлены вaa784f05; run37141651158 затем прошел80/80PG, actual browser11.9s против3.75s первого success. Исходный timeout не имел имени method, поэтому точная причина ретроспективно **не доказана**. Из этого не выводится исправление runtime platform или отсутствие flakes.

Browser harness теперь отдельно подтверждает Browser.getVersion readiness (bounded30s cold startup) перед Target; page commands/assertions по-прежнему10s, security/MFA/time/scope/audit assertions не ослабляются. Required PG job дополнительно запускает **три независимых browser runs, все три должны пройти**, не retry-to-success и не skip. Эти дополнительные прогоны не прибавляются к80 различным PG tests. Усиленный headfb130b1d/[run37141998305](https://github.com/PedFund/PedPsyRU/actions/runs/37141998305): все6jobs completed/success,195base+80PG и3/3 дополнительныхbrowser runs (3.81/3.68/3.72s),0fail/skip. Основной browser scenario в80PG также success(10.36s). Labels сохраняют safe диагностику будущего сбоя; повторные успехи не доказывают отсутствие любой будущей нестабильности. Финальная актуализация документов проверяется тем же gate, без runtime изменений.

03а#16/a061badc,03б#17/db7b327a,03в#18/ff3519dd,03г#19/892999a4,03д#20/1519f63d,03е#21/dcc4f2a3,03ж#22/226b2298,03з#23/b5c33757. На каждом актуальном head все6jobs success до merge, новая задача от текущей main, без force/reset/delete/openPR mass merge. Локальные файлы не имеют `.git`; сравниваются Git blob hashes с connector tree, не выдается утверждение о clean local branch. Финальная актуализация документов после03з идет отдельным documentation-only PR с тем же required gate.
