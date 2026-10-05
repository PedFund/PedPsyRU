# Атомарный допуск: технический план следующего малого блока

Статус05в.4б: локально реализованы pure own selection/API, PostgreSQL adapter и append030 с immutable evidence/guarded enroll/current RLS+clinical locks;9адресных units иfull294/294/checks passed.17actualPG cases написаны, **не исполнены локально**; ожидается284 wholePG +три extraChrome/all-six current-head gate. НетHTTP/bootstrap/UI/stand update. Ниже —принятый технический план/обязательства реализации, не actualSQL acceptance; этот файл не заменяет ROADMAP/STATUS/ENROLLMENT_VALIDATION.

## Контракт

Собственный session token + exact stage_id/expected_opening_revision=1/expected_passport_schema_version/expected_consent_policy_revision. Scope study/group/participant/роль/часовая отметка/флаги допуска не принимаются от браузера. Stage UUID — selector, не capability. CSRF раньше parse/mutation; SQL независимо повторяет проверки и CAS. Возвращаются только server study/group/stage/enrollment и attempt metadata, не ответы/ключи/результаты/контакт.

## Последовательность реализации

1. Защитная основа: private immutable admission evidence, минимальные scoped FK/indexes; current predicate для contact-bound cohort и защищённый lock scope на subsequent clinical operations. Старые legacy synthetic attempts без group binding сохраняют прежние правила, без фиктивного паспорта/согласий. Предикат не расширяет staff read/download и не выдаёт processing права админу. RLS пути attempts/responses/results/releases должны пользоваться current guard, а форма/чтение/draft/completion — lock scope в транзакции. Ни одного unguarded old-function alias/grant.
2. Атомарный guarded enroll: existing own identity locks; immutable binding/contact/schema/policy/docs/passport/acceptances; own stage/opening/enrollment/ordered assignments/releases. Completed current passport + current separate contact/study acceptance; secondary optional. Server UUID/time/first immutable basis. Unique study/participant/stage enrollment и enrollment/assignment attempt; idempotent retry сохраняет identity/data/time/evidence, excluded никогда не реактивируется. Нельзя задним числом создать T0 или выбирать чужую группу.
3. HTTP composition только после actual PG приёмки1–2, затем единый browser flow/05ж и окончательный05з.

## Обязательные проверки

Current requirements должны проверяться не только при первом create: отсутствие evidence или обязательного актуального согласия/завершённого паспорта/открытия не должно обходиться через прямой runtime SELECT/UPDATE, existing form, save или complete. Current status/revoke/expiry/версии после lock wait не заменяются cached JSON. Одновременно сохранить обе настоящие MFA staff global view/download роли и прежний вычислитель.

Admission evidence связывать с реальным participant credential, exact scoped enrollment/group/PID/stage и принятыми версиями, не только с произвольным набором UUID. Новая immutable evidence — техническая история, не юридическое бессрочное хранение. Minimal runtime guarded EXEC; таблицы/helpers default-deny, отдельные test-only fixtures проверяют попытки обхода/составные FK/ACL. Весь domain+nonempty full backup/restore/append migration upgrade/legacy regression сохраняется.

Короткие транзакции без crypto/mail/network; стабильный порядок SHARE/UPDATE и fresh wall-clock после ожиданий. Existing participant_credentials UNIQUE(study_id,participant_id) и participant identity/session lock используются, но уникальность enrollment/attempts обязательна независимо от приложения. Lock ordering проверяется против existing003/004/027/028/029, паспортных/consent writer и close/revoke; старый scope stage/enrollment/assignment/attempt нельзя просто дополнить поздним разноупорядоченным write lock. FOR SHARE для неизменяемых basis rows, попытка последняя; никаких более длинных SQL/auth/MFA timeout ради прохождения.

Тесты: no requirements/no row; othergroup/study/session role; current version CAS; T1-only/no T0; concurrent/relogin/restart/lostresponse retry; immutable original basis; excluded existing enrollment denied; audit rollback; direct runtime/RLS/legacy guard bypass; contact/consent/stage/assignment/revoke/expiry changes while waiting; own form/draft/complete; both real MFA staff view/download across studies; existing 14-table domain and handler outputs; full nonempty backup/restore и предыдущая→новая migration.

До current-head all-six/actual wholePG/threeChrome/base/preview/lineage/manifests acceptance нельзя подключать новое зачисление/participant UI. Real contacts/mail/legal texts/minors/operator/Selectel/phase6 остаются вне синтетического контура. Прежние contact+study required/secondary optional/no participant withdrawal/self-return/operator requests отдельно сохраняются.
