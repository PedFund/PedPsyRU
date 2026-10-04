# Проверка ручного открытия этапов — 05в.0

Дата: 2026-10-04. Область: только synthetic demo, study × group × stage.

## Реализация и пределы

Append-only `021_group_stage_access.sql`: отсутствие строки означает «не открыт»; первое явное открытие создаёт неизменяемую запись revision1 с серверным временем и реальным researcher/staff creator. Дизайн, его версия, назначения, участники, enrollment и attempts не изменяются. Открытие T1 для ЭГ не открывает T1 для КГ; другие этапы не закрываются автоматически. Закрытие/reopen отдельных этапов и календарь в этот блок не входят. Закрытое исследование не допускает открытие, даже если историческая запись сохраняется.

Исследователь управляет собственным исследованием; обе staff-роли глобально, своей сессией и актуальной MFA. Owner/current identity → study/current membership → group → stage → access locks; фиксированные SECURITY DEFINER функции с безопасным search_path, закрытые private helpers, RLS/default deny и отсутствием прямых table grants. Scope, active parents, назначенные допустимые synthetic releases, CAS и mandatory audit проверяются в той же транзакции; сбой или отрицательный central commit gate откатывает запись.

GET metadata и POST open подключены в обоих кабинетах, Origin/CSRF/exact DTO и trusted cookie realm сохранены. Серверная проекция — семь полей без контактов, creators, ответов, ключа и баллов. До открытия revision0; повтор с актуальным revision1 возвращает прежние id/time и отдельно аудируется; stale revision0 получает409 без скрытого повтора. UI при неопределённом результате блокирует открытие до явного перечитывания. Пятьдесят этапов читаются полностью, 51/oversize — явный413, без truncation.

## Написанные проверки

- Base DTO: revision0/1, malformed/extra authority, CSRF, IDs, output whitelist.
- Actual PG: activation не открывает этапы; независимые КГ/ЭГ/T0/T1/T2; сохранение и неизменный дизайн/legacy attempts; конкурентный owner/staff CAS и idempotent current replay.
- Обе реальные staff-роли/HTTP/creator/audit; чужой researcher/participant/cross-realm/CSRF; draft/closed/current inactive parents; stale MFA.
- Runtime direct DML/private helper denial; immutable history/creator/composite FK; mandatory audit rollback включая HTTP500.
- Current staff revoke, owner membership removal и study closure во время подтверждённого lock wait; ноль opening/allow audit после отказа.
- 50/51 bounded metadata. Existing 019→current upgrade test дополнительно применяет021, прежние invitations сохраняются, повтор миграций0.
- Chrome: researcher открывает T1 одной группы, в другой всё закрыто, reload сохраняет запись без изменения design_version; actual administrator MFA открывает этап, закрытый study UI скрыт. CI дополнительно выполняет три независимых browser runs.

## Подтверждённая степень готовности

Локально226/226 base, build/typecheck/architecture/syntax/dependency-policy passed. Новые PG/Chrome сценарии пока написаны, не исполнялись локально: прежний owner stand/secrets не мигрировали/не запускали. Требуется actual PostgreSQL18.6 CI и current-head all6/base/tree/parents/fullmanifest gate перед ordinary merge. Не выдавать наличие SQL за успешный тест.

Новая регистрация ещё не подключена: следующий05в должен проверять эту availability заново при enrollment вместе с invite/contact/passport/consent/current parent scope. Эта миграция не отзывает существующие legacy seed attempts и не открывает anonymous capability. Реальные данные, email provider, Selectel, юридические тексты и scientific publication остаются вне разрешённого synthetic блока.
