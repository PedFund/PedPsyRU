# Фаза 3 — аккаунты и кабинеты

## 03а: контракты и серверная политика

Основа main@964e273d; самостоятельный небольшой блок. `accounts.ts` определяет researcher/staff, версии сессии, named operations и scope. `account-policy.ts` — единая чистая матрица; `PostgresAccountAccess` разрешает только текущую серверную идентичность и членство, записывает обязательный метаданный аудит. Проверка сама по себе не выдает capability для последующей записи: будущая мутация обязана повторить авторизацию под своими transaction locks.

005 добавляет отдельные researcher credentials/sessions, quota=1 и индексы членства. Изменение пароля/статуса требует увеличения версии. Функции account_actor/account_owns_study не принимают роль/user из HTTP; PUBLIC и runtime SELECT private tables запрещены. Участнический session_actor/RLS не преобразует researcher в participant/staff. Снимок по-прежнему не переносит auth, новый auth исключен и из допустимого непустого import-target.

Обе staff роли глобально читают/скачивают; admin не управляет методиками/обработкой/staff roles. Superadmin имеет принятые policy-права, **не готовые endpoints**. Нельзя записывать ответы за участника. Исследователь — свои исследования и допустимые будущие агрегаты, без индивидуальной диагностики. Staff требует MFA; контроль/экспорт — proof младше пяти минут, иначе отдельная повторная проверка. Агрегационный N>=10 и защита фильтров — будущий сервис, не готовность по permission name.

7 локальных матричных тестов и 5 реальных PG scenarios: глобальные обе роли, собственное/чужое membership, отсутствие диагностического RLS у исследователя, missing MFA, fake realm/GUC, version/disable/revoke, fresh proof и audit failure. Локально186/186 base,0fail/skip; strict typecheck, architecture, dependency policy и syntax проходят. GitHub/реальный PG и интеграция фиксируются в STATUS после исполнения. Тестовые principals/сессии не являются публичным login или реальной MFA. Новые HTTP signup/кабинеты еще не включены; следующим блоком идут pending login и второй фактор.

Разработка только synthetic. Selectel, новые сервисы/оплата и реальные данные не используются. TKI/core/key/form, прежние миграции и SQLite не изменяются. Наличие успешных тестов не заменяет независимого аудита безопасности.

03а интегрирована#16/merge a061badc после всех6 current-head jobs run37135187573 success:186base+43PG.133blobs/preview/parents совпали.

## 03б: пароль и pending MFA

006 staff_login_challenges хранит только digest, credential version, срок<=5min, failed attempts<=5 и consumption. Ни challenge, ни пароль не выдают staff session. Вход резервирует durable global/per-code throttle до прежнего scrypt; unknown/revoked/wrong одинаковы. Password derivation вне transaction; finish повторно блокирует credential/user и проверяет актуальные hash/version/status, rotation/audit атомарны. Guard staff version требует increment на password/status и отзывает прежние sessions/challenges без диагностических изменений. Credential scope/role пока frozen (назначение роли —03д).

6 новых реальных PG scenarios проверяют обе роли/нет diagnostic capability, generic denial/throttle/recreation, rotation/expiry/disable/version, revoke во время derivation, reset/guard и audit rollback.1 локальная strict-input проверка; полные187base+49PG должны подтверждаться CI. Второй фактор/реальный login HTTP еще не включены, следующий03в. Никаких реальных аккаунтов/bootstrap/server автоматически не создается.

03б интегрирована#17/merge db7b327a после всех6 current-head jobs run37135880184 success,187base+49PG;140blobs/preview совпали.

## 03в: реальный второй фактор

TOTP SHA1/6digits/30sec/окно±1 реализован на Node HMAC по [RFC4226](https://www.rfc-editor.org/rfc/rfc4226) и [RFC6238](https://www.rfc-editor.org/rfc/rfc6238); опубликованные HOTP и SHA1 TOTP vectors, включая post2038, проверяются. Это стандартный TOTP, не phishing-resistant WebAuthn. AES256GCM через [Node crypto](https://nodejs.org/docs/latest-v24.x/api/crypto.html) шифрует20-byte random secret, случайный96-bit nonce и AAD credential/version, canonical base64url/tag, неверный key/actor/tamper дают отказ. Внешний32-byte key обязателен, defaults/ключа в DB/Git нет; future production key custody/rotation/backup требует отдельной эксплуатационной приемки.

007 хранит sealed factors/confirmation/last accepted step и только128-bit random recovery digests. Enrollment после проверенного password challenge; secret выдается один раз, повтор того же challenge409, confirmed factor не заменяется одним password. Verify вычисляет код только backend; клиент не задает verified_step/mfa proof/role. Credential/user/challenge/factor locks и актуальный wall-clock/версия проверяются при finish. Replay/5wrong/expiry/consumption/session rotation/recovery burn/mandatory audit атомарны. Failed MFA counter commit до401, не rollback по обычной неверной попытке. Audit failure откатывает все. Пароль снова нужен и для recovery, сам recovery code не bearer для staff endpoints. Новая MFA подтверждает только текущую версию credentials. Logout CSRF и отзыв; UI/fresh reauth через полный password+MFA следуют отдельно.

4base crypto tests и8 actual PG scenarios: обе роли/global access после второго фактора, отсутствие plaintext, replay/challenge reuse, одноразовый recovery/rotation, 5failed/recreate, concurrent confirmation, expiry/revoke, audit rollback, CSRF/logout/reset, confirmed-factor replacement/wrongkey.191base+57PG ожидают полную приемку CI. Реальный bootstrap/аккаунты/сервисы не созданы; public HTTP/UI еще не подключены.

03в интегрирована#18/ff3519dd после всех6jobs run37136396001 success,191base+57PG;146blobs/preview совпали.

## 03г: исследователи

008 —researcher_invites, invalidation trigger, fixed staff-management/researcher identity functions. withStaffOperation в одной transaction блокирует credential/user/session, повторяет current named policy, SQL сам повторяет роль/fresh proof; глобальный control lock сериализует management. Both staff invite/block; никакого нового индивидуального доступа researcher. Preview выдает одноразовый random32-byte invite_code и generated login только подтвержденному staff; URL/email не используются, provider не выбран. Срок24h, invite accept/global durable limits, derivation admission1pergateway. Реальный email/создание data subjects не выполнены.

Accept сохраняет salted scrypt только после актуального unconsumed/unrevoked invite/current user под locks; конкурентный accept дает одного победителя, reset guard/revoke/version. Researcher login отдельный (TTL30min/idle10min, durable throttle/dummy hashing/rotation), own home содержит только study id/title/status и quota1; неизвестные/чужие membership не выдают данные. Эта quota —параметр аккаунта; enforcement создания активных исследований будет конструктором фазы4. Block отключает user/credential/invites/sessions без удаления studies/answers. Read/control/audit atomic; actor/time от сервера, не запроса. Предельный list500 без truncation. Invite lost response не означает успех UI: нужно перечитать список и при необходимости выдать новое приглашение; code из DB обратно не восстанавливается.

7 новых PG scenarios: обе staff роли/full invite/login/block, own scope/no diagnostic, expiry/unknown/block/strict role DTO, fresh MFA/limits, concurrent accept/relogin/CSRF, mandatory audit rollback и block во время hash. Полная191base+64PG приемка ожидает CI; HTTP/cabinets следующими03д–03ж.

03г интегрирована#19/892999a4 после всех6jobs run37137129375 success,191base+64PG;153blobs/preview совпали.

## 03д: назначение административных ролей

009: только current fresh superadmin может назначить administrator/superadministrator активному researcher либо сменить роль другого staff. Свою роль нельзя менять. Promotion копирует существующий salted password hash в отдельный staff credential и атомарно отзывает researcher realm; пароль известен только владельцу аккаунта, plain password не читается. Новый staff до real MFA не видит диагностику. При role change version bump отзывает prior sessions/challenges, cascade меняет scope FK только у уже revoked session rows, сами rows сохраняются; исторический actor_role остается в immutable audit. Factor secret привязан к неизменному credential ID; новый password+MFA/recovery обязателен для новой версии/роли.

Глобальный management lock защищает конкурентные role changes. Self-change и last-active-superadmin guard не дают лишить платформу последнего действующего суперадмина. Будущий staff block/remove тоже должен применять этот invariant; такого public API пока нет. Directory доступен только superadmin с fresh proof; runtime direct credential SELECT/UPDATE по-прежнему отсутствует.

Первый synthetic superadmin создается отдельно `bootstrap_first_superadmin` под schema owner (SECURITY INVOKER, PUBLIC/runtime EXECUTE отсутствует, controlled demo/ci database name, guard first-only/advisory lock/audit). Не startup/migration/HTTP signup. В development реального bootstrap/паролей не выдавалось. Production bootstrap/восстановление ключей/доверенный оператор отдельно, не основание для размещения.

6 actual PG tests: admin/participant/self/strict DTO/fresh denied; role bump/relogin/recovery/history; explicit researcher promotion/no password-only capability; reciprocal concurrent demotions оставляют1superadmin; audit rollback; actual private owner-only first bootstrap/second denial.191base+70PG ожидают текущий CI.

03д интегрирована#20/1519f63d после всех6jobs run37137562347 success,191base+70PG;157blobs/preview совпали.

## 03е: диагностика обеим административным ролям

010 fixed private functions и PostgresStaffDiagnostics: both actual MFA staff roles global directory/read/download по принятой матрице, researcher/participant/pending/unknown/revoked denied. Download требует fresh proof, whitelist JSON включает raw A/B и сохраненные пять raw measures/версии/digest результатов; не source_text/key/hash/password/factor/form_snapshot. Не изменяет/не пересчитывает completed. User IDs/display_code —synthetic data; HTTP/реальное использование не делает их публичными.

Весь протокол/ответы/result в одном SQL statement MVCC snapshot: конкурентный save/complete не смешивает ревизии. Runtime не получает доступ к private tables, SECdefiner функция проверяет current authority под locks и повторяет его после формирования; mandatory meta audit и touch доcommit. Ограничения500records/4MiB и отсутствие truncation; отсутствующий/неправильный ID404. JSON bytes повторно проверяются Node до commit/выдачи. Directory тоже bounded. Download будет толькоPOST+CSRF/Origin в03ж, не GET side effect/download by guessed URL.

6 actual PG scenarios: both roles/all studies/original result/whitelist/audit; all forbidden realms/revoke; fresh/missing/closed study; concurrent consistent snapshots/immutable; audit rollback; byte/cardinality limits.191base+76PG ожидают текущий CI. Processing/method manager endpoints не добавлены.
