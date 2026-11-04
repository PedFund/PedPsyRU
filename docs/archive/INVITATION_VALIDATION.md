# 05б: общие групповые приглашения

## Последующее разрешение владельца:05б.1 — 2026-10-04

Staff-readonly ниже описывает первоначальный05б, не действующую MVP-матрицу. Владелец прямо разрешил administrator/superadministrator управление за исследователя глобально. Новая020 сохраняет019/history/token rules и добавляет реальные staff HTTP операции, current fresh MFA/owner lock/CAS/audit и отдельную immutable staff-creator FK. Приёмка — STAFF_STUDY_VALIDATION:PR#36/runtimece594173/run37195401170,225base+124actualPG18.6 и3Chrome по2/2/all6success; finaldocs gate/actualmerge вPR. Researcher foreign scope/participant/science/contact negatives сохраняются. Открытие этапов отдельно по группам принято, но availability/signup/enrollment здесь ещё не реализованы.

Дата: 2026-10-04. Блок: [PR#35](https://github.com/PedFund/PedPsyRU/pull/35), база main72edcbcc после принятого 05а/PR#34. Актуальное CI-доказательство/интеграция — STATUS и PR; компиляция TypeScript не доказывает успех SQL.

## Компоненты и границы

Append-only019 создаёт `group_invitations`: ID/study/group/hashed token/status/revision/created_by/created_at_ms/expires_at_ms/revoked_at_ms. Composite group FK и уникальный digest, один active invite группы, immutable identity. Index creator/time поддерживает persistent throttle; scope index — bounded list. Предыдущие018PG/SQLite migrations не переписаны, domain snapshot не включает новые auth secrets.

Приглашение многократное, но не credential/session и не confirmation email. Секрет:32 случайных байта/43base64url символа, хранится только SHA-256 digest. Raw token возвращается своему researcher только при создании; list/revoke/audit его не содержат. Готовая participant URL/QR и `/join` — будущий05ж, не выданы за готовый браузерный путь. Token не вставляется в logging URL path/query этим API.

Если действующая ссылка уже есть, create даёт409 INVITE_EXISTS, не тихую ротацию. После явного отзыва создаётся новая. Истёкшая запись перед новой выдачей переводится в revoked с revision+1 и отдельным аудитом; отказ дальнейшей записи откатывает всё. Срок задаёт researcher, server clock проверяет `(now, now+30 суток]`. Limits:10 успешных выдач на credential за15мин,100 исторических записей на группу, revision≤2147483646. Лишние записи/overflow — явный отказ, не truncation; история автоматически не удаляется.

Create только active synthetic study/active group. List/revoke своим researcher разрешены после закрытия. Revoke проверяет expected_revision отдельно от frozen study.design_version: один CAS победитель, stale409; повтор с актуальной revision идемпотентен. Никаких participants/enrollments/attempts при создании приглашения.

## Авторизация и аудит

`PostgresGroupInvitations`/fixed SQL повторяют current researcher credential/user/session/ownership/scope. Lock order согласован с existing constructor/lifecycle: credential → user/session → study → membership → group → invite. Current состояние проверяется после wait; central pure policy — второй commit gate в той же транзакции, не отложенная capability. Study design не изменяется.

Runtime не получает SELECT/DML таблицы, ownership, private snapshot/lock/audit helpers. RLS default deny; fixed definer functions имеют фиксированный search_path и проверяют полномочия. Public audited policy_scope тоже требует current ownership; самостоятельный вызов не разрешает последующую запись. Обе staff роли не получают новое editing/contact право; participant/anonymous realm запрещены.

Append-only audit: current credential, study_id, ID конкретного invite либо группы для list/policy, action/outcome/reason/time. Raw token/digest/password/email/диагностика не включаются. Отказ аудита откатывает действие; HTTP neutral500, отдельный обязательный denied audit через прежний account path.

## HTTP

- `GET /api/v2/researcher/studies/:id/groups/:group/invitations`: whitelist metadata.
- `POST` по тому же пути: exact `{expires_at}`, invite_token только успешному создателю.
- `POST /api/v2/researcher/studies/:id/groups/:group/invitations/:invite/revoke`: exact `{expected_revision}`.

Отдельный researcher cookie, existing Origin/CSRF/body/error guards. Path IDs не являются authority; membership/scope сверяются в БД. Client role/owner/digest/другая группа в body отвергаются. Нет staff CRUD, anonymous join, direct SQL или email endpoints.

## Проверки и история

Runtime aff67dfa8c06e7ce7b9dc37fab9d8fe1292598d1/run37192386231: all6success,224base Node22/24+115/115PG18.6 и три независимых дополнительных Chrome runs по2/2,0fail/cancel/skip. После documentation-only commit нужен новый current-head CI перед ordinary merge#35; фактическая интеграция/evidence —PR/STATUS.

12 новых actualPG/HTTP scenarios к прежним103: positive CRUD/hash/redaction; чужое/отсутствующее study/group; обе staff роли/participant realm; composite FK/immutable rows/private helpers; параллельная выдача/CAS/idempotency/close; server expiry/expired replacement/frozen version; audit rollback; revoke credential/membership/close во время lock wait; persistent throttle; точные100/101 и saturated revision; Origin/CSRF/exact DTO/error redaction.

Локально224/224base/build/typecheck/architecture/dependency-policy/JS syntax passed, focused19/19contract tests повторно. LocalPG55432/API4174 после перезагрузки не слушают и не перезапускались; новые SQL проверяются обязательным115-test GitHubPG18.6 job и тремя независимыми Chrome регрессиями.

Head929b50a0/run37191932468 заменён усилением audit target: PG cancelled/Required failure, не объединялся. b3dafed7/run37192082506:114/115PG,42P08 в cap fixture INSERT SELECT ($4 integer versus bigint), дополнительные Chrome skipped/Required failure. Явные bigint casts исправляют fixture; assertions/100/101 не ослаблены. Успех исправленного runtime и финальных документов требует нового all6 current-head/base/tree/manifest/parents gate, фиксируется STATUS/PR.

## Не включено

05в: регистрация/подтверждение email/возврат/enrollment/stage availability.05г–05е: паспорт/согласия.05ж–05з: participant browser/QR/сквозная приёмка. Invite revoke не отзывает прежнее личное участие. Реальная почта/provider/reminders/Selectel/publication/новые права/методики/legal approval/реальные участники не включены. Это не независимый security audit и не научная валидность TKI. PostgreSQL skill использован дляleastprivilege/composite FK/index/коротких транзакций/lock order; Supabase не подключён.
