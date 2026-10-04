# Проверка паспортной схемы и собственных значений

## 05г интегрирован; 05д локальные проверки — 2026-10-04

Окончательный `check:syntax` после18-гоPGcase иdocupdates passed; весь доступный localregression261/build/types/architecture/dependencypolicy passed на неизмененном runtime. LocalPG/Chrome не запускались, actual231/fullcurrent-headall-six остаются обязательной проверкойGitHub, не текущим результатом.

#42 ordinary maina738c57e/tree439e4099/finalbcd3a073, [run37228089292](https://github.com/PedFund/PedPsyRU/actions/runs/37228089292) all-six success:252baseNode22/24,213actualPG18.6/14newcases,триindependentextraChrome2/2,0fail/cancel/skip. Fresh updatedbase67015b70/preview/source/parents/262manifest/protected40 и actualpostmerge tree/parents/blobs verified. Work instructions/phase6plan exact retained, oldfailedrun37225848294 preserved below. Individualpassport/UI еще не проверялись этимschemaCI.

**05д runtime/model/application**: strict own ParticipantPassports port/DTO, pure scalar/schema feedback, Postgres fixed guardedread/save/complete, private027/pinned compositeFK/index/triggers. Partial/restart/CAS, saved-only requiredcompletion, completedimmutable/narrowlast-transitionretry; mandatorymetadata-onlyauditrollback/touch, current locks+wallclockexpiry after waits. No caller IDs/impersonation/null/coercion/zeroimputation/contactvalues/auditPII/clinicalrecords/autoenrollment. SQL independently repeats current field/types/bounds/choices/canonical Unicode trim; UI is notauthority.

Локально: initial TS buildfailure(controlflow arrow-never) исправлен functiondeclaration; попытка unitпослеfailedbuild далаmissingdist, затем9/9newunits иfull261/261base/build/typecheck/architecture/dependency passed, finalsyntaxcheck требуетсяпослепоследнихtests. Testtypes forbidforeignscope/formula/inlinecompletion. **18newactualPGcases написаны, еще не исполнены (ожидается231total)**:

- Metadata-onlyownnot_started/noinsert/noclinical; partialsnapshot/restart/sessionrotation/clearing безimputation.
- Mandatorysex-age-city-requiredcustom толькоexplicitcomplete; SQLvalue/types/options/range/Unicode/blankwhitelist.
- Two-tabCAS/stale schema/revision; immutableconcurrent/lost-responsecompletion.
- Separateparticipants/forgedGUCs/staff/researcher/legacy/sessiondenial, noimpersonation.
- Privatehelpers/table/PUBLIC ACL/compositeFK/pinnedschema/completedimmutability.
- Mandatoryvalue-freeaudit failure rollbacksave/complete/read/sessiontouch.
- Recruitmentrevoke preservesexistingaccess; currentnoticechange deniesoldack.
- Credential/group/contact/study lock-wait currentrevocation (fourcases).
- Profilelock-wait wall-clocksessionexpiry; contactpolicylock-wait noticechange.
- Nonemptycompleted fulloperationalpg_dump/restore exactrows/projection/privateACL.
- Existing026→027upgradenoautomaticprofiles/identity/schema/studymutation.

Передordinarymerge fullfreshcurrent-headall-six/actualPG/threeindependentChrome/base/preview/parents/fullmanifest/protected41 mandatory. ExistingChrome regressions не новыйpassport UI. Owner stand/config/MFA/core/packages/workflow/001–026 unchanged. Wholephase5/HTTP/UI/consents/enrollment/legal/security/scientific/realdata readiness не заявлять. SQL guidance influenced minimalEXEC/indexed scopedFK/shortfixedlock-ordertransactions; no Supabase service introduced. Primary PostgreSQL references remain applicable: [JSON functions](https://www.postgresql.org/docs/18/functions-json.html), [row-level security](https://www.postgresql.org/docs/18/ddl-rowsecurity.html); runtime tests не замена независимой приемки.

## Corrected-head actual CI; актуализация base — 2026-10-04

Work дополнительно обновил только план фазы6 в ROADMAP.md, main67015b70 (parentd40f28df). Точная секция сохраняется без изменения текущего passport code и требований владельца; окончательный свежий base —67015b70, необходим заново полный gate. Это план, не начало фазы6.

PR #42/head `69f967cac46629ecaf840012655cee764b550d1e`, [run37226646849](https://github.com/PedFund/PedPsyRU/actions/runs/37226646849): all-six completed/success, 252 base Node22/24, 213 actual PG18.6, все14 новых schema cases; три дополнительные независимые Chrome runs по2/2, без fail/cancel/skip. Первый failure ниже сохранен. Сведения «еще не исполнены» в исходном локальном отчете ниже исторические.

Свежий merge gate остановил интеграцию: main обновлен владельцем через Work, `d40f28df`, только новые AGENTS test/acceptance instructions. Точная новая секция сохраняется вместе с локальными паспортными изменениями обычным двухродительским commit; код/guards/packages/001–025/owner stand не изменяются. Run37226646849 доказывает прежний base c9b80, не новый head/base. Перед ordinary merge обязательны заново полный current-head all-six, actual213PG, браузерные регрессии, fresh base/preview/parents/full262manifest/protected40. Proof финальной интеграции в PR и следующем STATUS, не выдавать проверку схемы за individual passport/UI/consent/enrollment.

## Первый actual CI и исправление fixture — 2026-10-04

PR #42/head `e932fec6c4df844f53de69479c1f468c51d1472f`, tree `c35188105b67088272a33e0366189e313f8ec230`, [run37225848294](https://github.com/PedFund/PedPsyRU/actions/runs/37225848294): 252 base на Node22/24 passed, dependency/Secret success; actual PG18.6 —212 passed из213, один failure, ноль cancelled/skipped в PG. Три дополнительные Chrome runs **не выполнялись**: шаг пропущен после failure; Required gate failed, PR не объединён.

Единственный failure — attempt-bearing fixture использовал legacy seed study с researcher membership без real credential. Staff owner guard правильно вернул NOT_AVAILABLE раньше ожидаемого DESIGN_FROZEN. Исправлен только synthetic fixture: отозван legacy placeholder membership, назначен ровно один уже созданный действующий researcher owner; затем та же сильная проверка DESIGN_FROZEN и новая сверка неизменности clinical IDs/status/revisions. Runtime authority/freeze/SQL/assertions не ослаблены. Upgrade test также считает число последующих append-only migrations, не предполагает навсегда ровно одну026. Все13 остальных новых PG schema cases, включая scoped roles/current locks/audit rollback/full operational recovery, фактически прошли; это не all-six acceptance. Исправленный descendant head требует полного нового current-head CI/213 и трёх независимых Chrome runs перед merge. История failure сохранена.

## 05г: metadata-only, 2026-10-04

Основание — новое прямое решение владельца: sex/age обязательны; обязательность остальных researcher выбирает; max5 own questions. Default synthetic schema пока sex/age/city, не полный standard каталог. Образование/семья/дети/занятость/тип населённого пункта дополним позже с закреплёнными справочниками; не выдавать их за реализованные. Фаза11 пока GitHub/Actions, не Selectel.

Реализованы PassportSchemas port, strict application input/CSRF/CAS/whitelist/limits и guarded Postgres adapter, append-only026. Immutable version history + current scoped pointer, metadata-only backfill/new-study trigger. Default sex/age required невозможно отключить через DTO/SQL; city requirement и max5 дополнительных boolean-required fields выбирает researcher. Types limited text (1..500 limit), integer (bounded ±1000000), single_choice (1..20 stable IDs/labels); никакого arbitrary code/scoring. Age0..130 — technical limit учебного поля, не норма/approval работы с несовершеннолетними.

Существующие current constructor locks/ownership/real staff/fresh MFA/study CAS сохраняются, добавлен schema CAS. Active/closed/attempt-bearing frozen. Metadata mutation, historical insert, current pointer, study version и mandatory metadata audit atomically committed; failed audit откатывает всё. Researcher только own study; staff globally metadata, не impersonation/individual values. Private RLS/no direct table/PUBLIC function access, два guarded runtime EXECUTE, indexed composite FK. Повтор того же current definition audited без новой версии; stale CAS всё равно отказ. Версий максимум100/исследование, история не удаляется.

Локально 252 base tests и build/typecheck/syntax/architecture/dependency checks passed после нового уточнения; восемь новых units проверяют field union/projection, flags/max5, authority/scoring rejection, label/text/numeric/choice bounds, DTO/CAS/scope/CSRF. Types test rejects scoring/string-required/participant edit DTO.

**14 actual PG cases написаны, ещё не исполнены; ожидается213 total**:

- Default schema для new/existing studies, metadata whitelist.
- Три own types/new immutable version/idempotent current replay/history.
- SQL whitelist/bounds/max5/required policy и отсутствие failed version.
- Same-study CAS race и независимый stale schema conflict.
- Active/closed/attempt-bearing frozen.
- Foreign researcher/participant realm denial.
- Administrator и superadministrator globally metadata; real actor/audit/fresh MFA (две проверки).
- Mandatory audit failure откатывает version/pointer/study CAS.
- Default-deny private tables/helpers/PUBLIC, scoped FK и immutable deletion guards.
- Staff revoke и owner membership removal во время SQL lock wait (две проверки).
- Existing025→026 upgrade: только metadata backfill, прежние study rows неизменны.
- Nonempty history full operational pg_dump/restore + restored private ACL.

Обязателен actual current-head all-six/base/preview/tree/parents/fullmanifest/protected40 gate. Старые Chrome suites проверяют регрессии, не паспортный UI. Participant values/HTTP/UI/consents/enrollment не реализованы этим блоком. Old domain snapshot не включает паспортную историю; operational backup отдельный. Owner stand не мигрировался, secrets/MFA/core/package/workflow/001–025 не изменены. Успешное исполнение не равно independent security/legal/scientific approval или готовности реальных данных.

SQL JSON/trigger/default-deny детали сверены с primary PostgreSQL18: [JSON functions](https://www.postgresql.org/docs/18/functions-json.html), [trigger functions](https://www.postgresql.org/docs/18/plpgsql-trigger.html), [row security](https://www.postgresql.org/docs/18/ddl-rowsecurity.html). Skill PostgreSQL повлиял на private tables, минимальные EXECUTE, FK indexes, короткие транзакции и согласованный порядок locks, не вводит Supabase product.
