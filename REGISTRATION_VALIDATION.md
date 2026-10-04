# Проверка регистрации участника — фаза05в

## 05в.1 — landing, reservation и durable confirmation outbox

Дата2026-10-04; synthetic only. После интегрированногоPR#37/main5c2f5543. Это первый малый persisted блок, ещё не подтверждение email, вход, выдача прохождений или готовый UI регистрации.

Append-only022 добавляет immutable synthetic contact_notices, отдельную study_contact_policies (FK/default init trigger, не изменение frozen design или legacy snapshot), registration_pending и contact_confirmation_outbox. Все новые таблицы/RLS/private helpers закрыты runtime direct access. Разрешены только три фиксированные backend функции landing/reserve/queue. Никаких role/owner/группы из клиентского тела.

Landing показывает только название исследования/группы и versioned synthetic notice, лимит64KiB/200-char title/100-char group, без truncation; GET не создаёт pending/participant/session/enrollment/attempt или email proof. Start принимает только вымышленные @example.test; shared email validator вынесен в pure port, прежняя normalization/test contract неизменна (local case/dots/+ сохранены, DNS domainlowercase). Realmail/PII/Selectel остаются выключены.

Перед scrypt SQL-admission под persistent global/browser/study-email throttle:30/5мин global,5/15мин browser/email; live pending cap1000/study. Reservation60сек привязана к browser_hash, study/group/invite/revision и current contact notice. Прежняя active заявка того же browser/email и её unsent outbox отменяются; другой browser не переписывается. Отказ/сбой hashing может оставить только transient reserved row с NULL password/confirmation material до expiry; это не participant или credential. Этот намеренный preflight commit не обещается как «вся база пустая после любого отказа».

Существующий salted scrypt выполняется без SQL locks. Новый random256-bit confirmation хранится как digest в pending и AES-256-GCM envelope в outbox (purpose+deliveryID AAD, отдельный explicit32-byte key, не MFA key). Plaintext password/token не возвращаются start и не входят в DB/audit. Queue снова под current study→group→invite→policy→notice→pending locks проверяет scope/status/expiry/revision/version/browser; pending hash+ready outbox+mandatory audit коммитятся атомарно. Нет доставки внутри DB-транзакции.

Одноразовое подтверждение, постоянный participant/contact/credential, existing-mailbox без password reset, scoped login и encrypted delivery worker —следующие05в.2/05в.3. Enrollment/attempts только после passport/consent/current manual availability05г–05е. В этом блоке нет HTTP routes/receiver/bootstrap contact key или новых контактных прав staff/researcher. Owner stand/secrets не изменены.

## Проверяемые сценарии и степень готовности

Первый actualCI PR#38/head159cf497f18fbb7813652d7e0efb368439022f0c/tree2cdf437d88c9875d8b4879ee045c1dda23df5a38/[run37202694987](https://github.com/PedFund/PedPsyRU/actions/runs/37202694987):all6completed/success,228base Node22/24+148/148actualPG18.6 и3extraChrome2/2каждый,0fail/cancel/skip. После него добавлен13-йcase полногоpg_dump/pg_restore именнонепустойpending/outbox, retainedkey и hardenedruntime; transportвыделенизпрежнегоbackupfixture безизменениялимитов/redaction/контейнерногоguard. Новыйhead ожидает149actualPG, требуетновогоCI; первый148run неgatesпоследующиеsourcechanges.

Локально228/228 base/build/typecheck/architecture/syntax/dependency-policy passed. Новая crypto unit проверяет nonce randomness, wrong key/context/row/MFA envelope/malformed/tamper и no plaintext. Прежние email DTO/normalization tests сохранились.

Написаны12новых actualPG cases: metadata-only GET; salt/hash/encryptedoutbox/auditredaction/zero clinical rows; neutral repeat/rotation/other browser; invalid scope/contact/notice; durable prehash throttle; audit rollback с только reserved metadata; invite revoke/closure/notice change during hashing; current closure after confirmed SQL lock wait; runtime/private/immutable guards; metadata/live cap. Общий ожидаемый suite148actualPG cases (прежние136+12новых), включая Chrome/backup/legacy snapshot/upgrade, должен исполниться вactual CI. На момент записи новыеSQL/PG ещё не проверены, required current-head all6/base/preview/tree/parents/fullmanifest gate обязателен.

## Восстановление и ограничения

Legacy demo DOMAIN_TABLES snapshot не является backup новых contact policies/pending/outbox, как и прежних account/invite/opening workflows. Полный PostgreSQL backup сохраняет operational tables; будущая доставка требует отдельного recovery encryption key. Не пересоздавать key при существующей очереди/restore и не хранить его в GitHub/DB/snapshot. Реальная retention/purge/адреса/юридические условия/почтовый provider/масштабная нагрузка ещё требуют последующих решений. Synthetic reserved/pending/queued не считается доказательством владения реальным email или личностью.
