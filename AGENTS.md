# AGENTS.md — PedPsyRU

## 2026-10-05: 05е.0 — точная проекция контакта, второй failure

Второй actual CI #45/head `4c8870842fbcd21d749122a6ab2539db37cc6ed1`, [run37269417616](https://github.com/PedFund/PedPsyRU/actions/runs/37269417616): new028 SQLcompile прошёл, Node22/24 по275/secret/dependency success; PG18.6 241/250, девять новых snapshot-dependent cases failed, три новые invalid/refusal/expiry/upgrade ветви прошли (12 total, триpassed); все238 прежних сценариев прошли. Общая причина 42703: own_consents_snapshot ошибочно читал contact_notices.text, тогда как существующая022 хранит body. Только new028 projection теперь n.body AS text; old022/schema/условия/гранты не меняются, added exact-contact-body PG regression assertion. ExtraChrome skipped/Required failed —не merge. First0/250compile failure сохранён отдельно; требуется новыйfullcurrent-head all-six/250PG/threeChrome/freshbase/preview/parents/fullmanifest/protected42 gate.

## 2026-10-05: 05е.0 — первая SQLcompile ошибка, не приёмка

Первый CI PR #45/head `f2024aa5830dde2e1aa0f047bf8fe78d4fcfba37`, [run37268672816](https://github.com/PedFund/PedPsyRU/actions/runs/37268672816): Node22/24 по275, secret/dependency success; PG18.6 0/250, все fixtures остановились при создании схемы (42601, position12123/028 line140), extraChrome skipped, Required failed. Это общий дефект новой миграции, не250 разных ошибок обработки; merge запрещён. SQL CASE внутри IF не был заключён в скобки, поэтому read_sql_construct останавливал expression на первом THEN при parenlevel0. CASE expression теперь parenthesized без изменения сравнения currentpolicy/documentversion; old001–027/guards/grants/assertions unchanged. Грамматика подтверждена [официальным PostgreSQL18 parser source](https://raw.githubusercontent.com/postgres/postgres/REL_18_STABLE/src/pl/plpgsql/src/pl_gram.y), раздел read_sql_construct. Новый full current-head250PG/threeextraChrome/all-six/source/base/preview/parents/manifests gate обязателен; локальный JSsyntax не доказывает SQLcompile.

## Текущий 05е.0: раздельные версии/явное принятие — 2026-10-05

Паспортный HTTP 05д.1 интегрирован обычным PR #44 merge: main `618bbe3eb11c617b1b970aa57853dd87a975c7de`, final source `7581ace6167e50962f0aeef53e43fd5a5ffd20bd`, tree `e7a4fa4125f118db64cb37913de1d3c2cafb44fd`. [Run37266471322](https://github.com/PedFund/PedPsyRU/actions/runs/37266471322): все шесть jobs completed/success; 268base Node22/24, 238actualPG18.6 (все7newHTTP cases), три дополнительных независимых Chrome runs по2/2,0fail/cancel/skip. Source ancestry/preview/current base/full274blobs/protected42/all257unchanged и actualpostmerge main/parents/tree/allblobs проверены. Первый failedrun37265445238/237of238 сохранён; исправлен тест ожидания staff-only audit.actor_role, runtime/SQL/права не изменены, real credential role/resource/reason проверяются дополнительно.

05е.0 — отдельный persistence/application блок: ParticipantConsents own-session-only port, strict explicit-purpose/version/policy-revision/accept:true DTO и fixed guarded PG read/accept. Append028 хранит immutable synthetic документы, текущие scoped policy pointers и immutable own acceptance с actualcredential/server time/composite FK/indexes. Existing023 contact acknowledgement проецируется отдельно с происхождением contact_notice_confirmation, не копируется в participation/secondary records. Required contact+study, secondary отдельно optional согласно прежнему решению; новое обязательное третье согласие не вводится. Same-current retry сохраняет исходное время/одну запись; stale policy/version409. Read/accept ничего не создают в passport/clinical enrollment/attempts.

Только два guarded EXEC runtime; private tables/helpers/PUBLIC revoked/default-deny. Current identity/group/contact/question scope027 reused, затем policy/docs/ownacceptance locks в стабильном порядке, fresh wall-clock expiry после ожиданий и mandatory metadata-only audit/touch в той же короткой транзакции. Нет сетевых вызовов, HTTP/UI/реальных юридических текстов, participant withdrawal/self-return/admin impersonation/operator mutation endpoint/автоматического удаления. Обращения оператору отдельно остаются принятым правилом; техническая неизменяемость истории не означает юридическую неотзывность/бессрочное хранение. Реальные данные/несовершеннолетние/сроки/оператор/правовые тексты требуют отдельной проверки до pilot.

Локально семь новых units, full275/275/build/typecheck/architecture/syntax/dependency policy passed (0fail/cancel/skip). 12 новых actualPG scenarios написаны, **не исполнены локально** (ожидается250total): exact three-purpose source/version/time/no inference/no backfill; mandatory/optional/refusal; strict SQL DTO/current versions; concurrentretry/relogin/restart; own/realm/forgedGUC isolation; mandatoryauditrollback+private audit; policy-change lock race+explicitnewversion; wall-clock expiry whilewaiting; privateACL/PUBLIC/compositecredentialFK/immutability; nonemptyfulloperationalbackup/restore;027→028upgrade. Actual current-head all-six/250PG/три extra Chrome/currentbase/preview/parents/fullmanifests/protected42 обязательны передordinarymerge; прежний green #44 не доказывает новый SQL. Existing Chrome не новый consent UI.

После small acceptedmerge —05е.1 HTTP/no-withdraw/no-selfreturn, затем05в.4 guarded enrollment,05ж participant UI,05з acceptance; шестая из восьми основных задач фазы5 ещё вработе. Work AGENTS targeted/full acceptance и ROADMAP future6А/6Б sections сохраняются точно; phase6 не начинать. Owner stand/MFA/secrets/core/package/workflow/001–027 не менять; не запускать/не мигрировать локальный owner stand. Старые05д.1 failed/pending ниже —история.

## 2026-10-05: 05д.1 — исправление тестового предположения, не прав

Первый CI PR #44/head `507d6ed26b79ed163586b9cffb162f930aee7579`, [run37265445238](https://github.com/PedFund/PedPsyRU/actions/runs/37265445238): Node22/24 по268 и secret/dependency success; actualPG18.6 237/238, один новый metadata-role test failed, три extra Chrome skipped, Required failed. Merge запрещён. Причина — неверное ожидание нового теста: существующее audit.actor_role обозначает только staff (002/020), researcher хранится с null и реальным credential_id. Тест исправлен по действующему контракту и усилен join-проверкой resolved credential role, exact real credential/resource/reason; SQL/runtime/MFA/правила не изменены и assertions доступа не ослаблены. Нужен новый полный current-head all-six/238 actual PG/three extra Chrome/fresh base/preview/parents/manifests/protected42 gate; failed head/run сохранены.

## Текущий малый 05д.1 и новое решение о согласиях — 2026-10-05

PR #43 объединён обычным merge в main `06b4bb2447d148789f1fdecfb4a03095db4e2c0e`; head `21e7c0b2d678d886333da0ab2b52ee4ba0ee6d53`, tree `b2903fdff01308cd884deb10dfdaaef0fbc5b711`. [Run 37230123877](https://github.com/PedFund/PedPsyRU/actions/runs/37230123877): все шесть jobs success; 261 базовый тест на Node 22/24, 231 actual PostgreSQL 18.6 (18 новых own-passport cases), три дополнительных независимых Chrome runs по 2/2; ноль fail/cancel/skip. Проверены source/preview/current base/parents, полные 270 blobs и protected41, затем actual main/tree/parents/blobs.

05д.1 подключает существующий own passport и metadata schema к HTTP: строгие DTO/projection/query rejection, отдельные существующие cookie realms, CSRF/Origin/Host/body cap и обязательный denial audit; SQL повторно проверяет текущие права под locks. Passport boundary включается только с прежним explicit synthetic registration opt-in, старый owner stand не мигрировать/не запускать/не трогать ключи и MFA. Локально 7 новых адресных HTTP units и полная регрессия 268/268 passed; build/typecheck/architecture/syntax/dependency policy passed. Семь новых actual PG HTTP cases написаны (ожидается 238 total), требуют current-head all-six CI/actual PG/three extra Chrome/current base/preview/parents/full manifest/protected42 перед ordinary merge.

Владелец принял: в MVP нет кнопки отзыва согласия и самостоятельного возвращения; обращения к оператору рассматриваются отдельно, без автоматического удаления данных. Это не юридическая «неотзывность» и не разрешение бессрочного хранения: основания дальнейшей обработки/сроки/процедура обращения требуют отдельной правовой проверки перед реальными данными. Состав/обязательность третьего согласия ещё не уточнены; прежние два обязательных + отдельное добровольное научное использование не меняются.

После принятого малогo HTTP-блока продолжать 05е отдельными версиями/событиями согласий, затем 05в.4 guarded enrollment, 05ж UI, 05з acceptance; никакого silent reconsent/autoenrollment/science grant. Work targeted-testing/full-acceptance инструкции и phase6 6А/6Б план ниже сохранены. Старые «05д/PG/withdrawal ожидает ответа» ниже — история; вся фаза 5 ещё не закончена.

## Текущий05д после интеграции схемы и инструкций Work — 2026-10-04

PR#42 ordinary merged main `a738c57e04c6e9b6dcd854ee9572829857585487`, final head `bcd3a07353af8b27ab962697a57d6c76b3155da5`, run37228089292 all-six success:252baseNode22/24,213actualPG18.6 (14new schema cases),три extra independentChrome2/2,0fail/cancel/skip. Fresh main67015b70/preview/source/parents/full262manifest/protected40 и postmergeactualmain проверены. Work updates AGENTS targeted-test/full-acceptance и ROADMAP future6А/6Б перенесены точно; phase6 не начинать. Старые pending ниже —история, failure сохранен вPASSPORT_VALIDATION.

Следующий малый05д локально: own participant passport port/pure DTO/PG save/read/complete, append-only027/private pinned schema FK/CAS/mandatory sex-age-current flags/current locks/wall-clock expiry/metadata-only mandatoryaudit; безHTTP/UI/consent/enrollment.261localbase(build/typecheck/architecture/dependencies) passed,18newPG написаны (ожидается231total),actualCI обязателен передordinarymerge. Owner stand/MFA/secrets/core/package/workflow/001–026 не менять. После accepted merge продолжать05е раздельные согласия; withdrawal-return product question еще открыт, новую политику не угадывать. Можно независимыйHTTP/UI подготовительный блок, но не заявлятьсквознойflow готовым. Основной порядок05г→05д→05е→05в.4enrollment→05жUI→05зacceptance сохраняется.

05г первый actual CI #42/e932fec6/run37225848294:252 base passed, PG18.6 212 из213, один legacy-owner fixture failure; extra Chrome skipped, Required failed —не merge. Test-only fixture теперь имеет ровно одного real owner и проверяет прежний DESIGN_FROZEN плюс clinical immutability; guards/SQL не ослаблены. Нужен новый full current-head all-six/base/preview/tree/parents/262manifest/protected40 gate; PASSPORT_VALIDATION/STATUS ведут failure/proof. Обязательные sex/age/max5 и новые решения ниже сохраняются; после safe merge автономно05д, withdrawal return не угадывать.

## Новое прямое решение владельца и текущий 05г — 2026-10-04

Пол и возраст обязательны. Обязательность остальных паспортных полей выбирает исследователь; своих вопросов максимум **пять**, не десять. Полный основной каталог паспортных полей добавляется позже: пока sex/age/city, не выдавать это за весь каталог. Это заменяет прежнее требование optional basic ниже. Настройка staff за исследователя остаётся принятым studies.configure с реальным actor/MFA/audit, не изменение индивидуальных паспортных ответов. Фаза 11 пока тоже GitHub/Actions synthetic tests, **не Selectel/deployment/real data**; GitHub не становится хранилищем реальных контактов/диагностики.

05в.3б интегрирован обычным merge #41/main `c9b80a5af59d3b3f75a405aae4792f25bd9cf976`, head `ae529436`, run `37223885301` all-six success: 244 base (Node 22/24), 199 actual PG 18.6, три дополнительных Chrome runs по 2/2, без fail/cancel/skip. Все 254 blobs/tree/parents и protected39 проверены. Source pending statements ниже — история; actual proof в PR #41.

Текущий маленький 05г: metadata-only immutable versioned schema + current pointer, append-only026; обязательные sex/age, city requirement configurable, пять additional fields с boolean required/type/whitelist/limits. Draft-only existing current owner/staff/MFA locks + study/schema CAS + mandatory audit, private tables/helpers. Никаких индивидуальных значений/HTTP/UI/consents/enrollment/stand secrets. Восемь новых units passed; 14 новых PG tests ещё требуют actual CI (213 total) и fresh all-six/base/preview/tree/parents/fullmanifest/protected40 gate. Затем автономно05д own passport, 05е consents, 05в.4 enrollment, 05ж UI, 05з acceptance. Вопрос withdrawal return открыт; не угадывать, продолжать независимые блоки.

## Текущий блок 05в.3б — 2026-10-04

05в.3а интегрирован обычным merge PR #40: main `09e0d63a4f85a4362c5937ded0fe2a3a01692f16`, final head `e90adce183243b15e9315590abd35de9e27a1ee8`, run `37221394432`: все шесть jobs success; 233 базовых теста на Node 22/24, 191 actual PostgreSQL 18.6, три дополнительных независимых Chrome runs по 2/2; без fail/cancel/skip. Проверены actual tree, parents и все 242 blobs.

05в.3б локально реализует HTTP-композицию существующей регистрации: отдельный подписанный pre-auth HttpOnly cookie/CSRF, explicit separate contact key, synthetic-only receipt, session только после собственного email/password login, append-only 025 для обезличенного обязательного denial audit. 244 базовых теста и проверки сборки/типов/архитектуры/зависимостей пройдены; восемь новых PG HTTP-сценариев ещё требуют actual CI (ожидается 199). Перед ordinary merge обязателен свежий current-head all-six/base/preview/tree/parents/fullmanifest/protected gate. Затем продолжать 05г (версия паспорта), 05д (собственный паспорт), 05е (раздельные согласия), 05в.4 (guarded enrollment), 05ж (UI), 05з (приёмка). Вопрос о возврате после withdrawal открыт; независимые задачи не блокирует, политику не угадывать. Старые статусы ниже исторические. Owner stand, MFA, secrets, 001–024, core, packages и workflow сохранить; real mail/Selectel/новые права не вводить.

## 05в.3а технически проверен; финальный допуск — 2026-10-04

PR#40/runtime8564527b/tree4595faf2/run37220579686 all6success:233base+191actualPG18.6/3extra independentChrome2/2each,0fail/cancel/skip.16newreceipt cases исполнены,242manifest/protected38 checked. STATUS/REGISTRATION_VALIDATION ведут ограничения/доказательства. Final documentary head —новый current-head all6/base/preview/tree/parents/fullmanifest gate; actualordinaryintegration вPR. Затем автономно05в.3б HTTP/key/signed dedicated HttpOnly cookie/CSRF; не realmail/provider/enrollment/ownerstand/MFA reset. Root main#39/0ce94971 сохранён,001–023/core/package/workflow unchanged. Вопрос withdrawal return ещё открыт, новую политику не вводить; независимые работы продолжать. Прежние «PG неисполнен» ниже —история.

## Текущий 05в.3а после интеграции #39 — 2026-10-04

05в.2 actual ordinary merged main0ce94971/finalf93d3b64/run37218552215 all6success:230base+175PG18.6/3independentChrome2/2each, full235manifest/tree/parents verified; failures ниже исторические. Следующий05в.3 разделён на small persistence receipt/context (05в.3а), затем HTTP/key/cookies (05в.3б), не одна огромная задача. Append024/private current guards/crypto outside SQL/explicit synthetic opt-in/own browser+invite/mandatory audit/limits; нет realmail/HTTP/autoenrollment/session/ownerstand change.233/233base+build/typecheck/architecture/syntax/dependency passed;16newPG/191 total ещё не исполнены. Before ordinary merge current-head all6/actualPG/3Chrome/base/preview/tree/parents/fullmanifest/protected38 обязателен; actualintegration вPR/STATUS. Затем продолжать автономно05в.3б и независимые паспортные задачи. Вопрос о withdrawal return ожидает владельца; новую политику не угадывать. Core/001–023/package/workflow/MFA/stand secrets сохранить.

## Функциональная проверка 05в.2 и финальный допуск — 2026-10-04

PR#39/head964458a5/tree7782fc52/run37213372532:230base+175actualPG18.6 и3независимых дополнительных Chrome runs по2/2,0fail/cancel/skip; dependency success. All6 ещё не accepted: Secret scan/Required failed из-за доказанного historical Markdown test-count false positive; exact fingerprint/обоснование —SECURITY_AND_DEPENDENCIES, не широкий skip. Предыдущий failed175/000045ad/run37206238264/constructor reload race сохранён; test-only fresh DOM barrier и2deterministic units, timeout/auth/assertions не ослаблены.26newregistration cases/append023/scopedemail/oldcode blocked дляcontact accounts/password/group/currentlocks/upgrade фактически проверены. Final documentary/fingerprint head проходит новыйall6/current-head/base/preview/parents/full235manifest/protected37 передordinarymerge; actualintegration вPR. Затем автономно05в.3 HTTP/syntheticreceiver/separate explicitcontactkey, неenrollment/realmail/ownerstand/MFA reset. Вопрос владельцу о возврате после withdrawal ещё ожидает ответа длябудущегоconsentблока, текущей регистрации не мешает. Старые pending25/174 ниже —история.

## Текущий малый блок 05в.2 — 2026-10-04

05в.1 ordinary merged#38/mainfde3e100d023a72e4a5966a6e465995de58f12b6, final4faf1bcf/run37204228769 all6success/228base+149actualPG18.6/3Chrome по2/2; 230 actual blobs/parents/tree проверены, открытых PR после merge нет. Теперь локальный 05в.2: append-only023, private fixed group/contact/contact-notice acknowledgements, одноразовое browser/invite/current-notice confirmation и scoped email login через existing scrypt/session rotation. 25 новых PG cases написаны, требуют actualCI (ожидается174 total); build/typecheck/architecture/syntax/dependency policy и228base passed. Никаких HTTP/bootstrap/mail/receiver/enrollment/consent bypass; это следующий05в.3/05г–05е. Проверять current SQL lock state, а не только JS snapshots; failed proof attempts/audit коммитятся до neutral404. Existing email никогда не заменяет пароль/группу/ID/status и не объединяется между studies. Owner stand/секреты/core/001–022/package/workflow не менять. После small ordinarymerge продолжать следующий блок, не останавливаться после успешной подзадачи.

## Приёмка 05в.1 — 2026-10-04

PR #38, runtime head `9bb3f94052afb2afca8164e86200b6f8a3976501`, tree `90eb6ca23787f1c173b6c0a251c0a2e8f5acf4df`, run `37203662168`: все шесть jobs completed/success; 228 base (Node22/24), 149 actualPG18.6 и три независимых Chrome runs по 2/2, без fail/cancel/skip. Проверен полный backup непустой pending/outbox с отдельным retained key и default-deny после restore. Финальный documentary head требует нового полного current-head gate перед ordinary merge; actual integration фиксируется в PR. После интеграции продолжать 05в.2 (одноразовое confirmation/contact/scoped login), затем 05в.3 (HTTP/synthetic receiver), без ожидания отдельного подтверждения. Ни enrollment, ни realmail/Selectel/новые права не добавлены. Старые «ожидается CI» ниже — история.

## Текущий05в.1 — persisted registration start, 2026-10-04

05в.0 integrated#37/main5c2f5543, final8ca61c65/run37200928344 all6success/227base+136PG/3Chrome/222manifest. Теперьлокальный05в.1: append-only022/immutable synthetic notice+отдельная policy/pending/encryptedoutbox; landing/reserve/queue, browser+invite+revision+notice binding, prehash persistent throttle/1000live cap, mandatoryaudit/current locks. Локально228base passed,12newPG требуютactualCI; REGISTRATION_VALIDATION/STATUS ведутproof. Существующийcore/package/001–021/SQLite/snapshotформат не переписывается. После small ordinarymerge05в.2 одноразовоеconfirmation/existing-password-preserving/contact/scopedlogin;05в.3HTTP/syntheticreceiver. Enrollment послеpassport/consent/currentopening, не наcontactstart. Только@example.test; no realmail/provider/PII/Selectel/ownerstandsecrets/newscientificrights. Не выдавать pending/outbox за email proof/participant/готовыйbrowserpath.

## Текущий малый блок05в.0 — 2026-10-04

05в.0 технически принятPR#37/runtimee178d784/run37200472709 all6success:227base+136actualPG18.6/3Chrome по2/2.12newstagecases, failurea1b057e3/135of136 сохранён: shared test-only previous-step TOTP helper ждёт безопасного окна, production MFA неослаблена. Finaldocs проходят новыйcurrent-head gate;actualintegration вPR. Послеordinarymerge продолжать05в малымиблоками: pending/outbox → одноразовое confirmation/login → HTTP/synthetic receiver; enrollments только после05г–05е passport/consents/currentavailability. Старые строки «локально/CI требуется» ниже исторические. Не начинатьrealmail/Selectel/новыеscienceправа/переписываниеcore илиownerstand.

PR#36 ordinary merged main a77dc62e, finala68523cc/run37195859358 all6success/225base+124PG/3Chrome;214blobs actualtree/parents проверены. Локально следующий05в.0: append-only021/ports/API/PG/HTTP/UI manual group opening. Отсутствие access row = not_open/revision0; insert immutable open/revision1; same-current replay audited, stale409; no design/enrollment/attempt mutation или auto-close других этапов. Пока226base passed; новые PG/Chrome не выдавать за проверенные до current-head all6. STAGE_ACCESS_VALIDATION/STATUS фиксируют proof и пределы. После ordinary merge последовательно05в registration/contact confirmation synthetic; новые реальные права/почта/legal/science требуют прежних решений. Не переписывать001–020/core, не трогатьignoredownerstand/secrets.

## Область действия

Эти инструкции автономной разработки действуют во всем проекте PedPsyRU.

## Новое решение владельца: MVP-управление исследованиями — 2026-10-04

Последующее уточнение владельца: manual opening **отдельно для каждой группы**; scope = study × group × stage. Открытие T1 для ЭГ не открывает его КГ. Реализация availability — следующий маленький блок05в.0, не изменение science/версии дизайна.

05б.1 технически принятPR#36/runtimece594173/run37195401170:225base+124actualPG18.6 и3Chrome по2/2, all6success. STAFF_STUDY_VALIDATION/STATUS сохраняют firstfailedCI116/121→исправленныеfixtures/approvedmatrix без ослабленияguard и новый019→020upgrade/currentrevocationwait proof. Finaldocs требуют новогоcurrent-head/base/preview/tree/parents/manifestgate; actualintegration —PR. После ordinarymerge продолжать05в.0; не смешивать ещё не реализованный availability с constructor active, не трогатьignoredownerstand/secrets без отдельного безопасного upgrade.

Владелец принял **ручное открытие этапов исследователем, администратором или суперадминистратором** и разрешил обеим staff-ролям выполнять действия исследователя во всех исследованиях MVP. Это заменяет прежние запреты staff-editing ниже (исторические контрольные точки), но не отменяет изоляцию исследователей, frozen active/closed/attempt-bearing design, CAS, квоту владельца и обязательный аудит. Сотрудник действует своей staff-сессией/актуальной MFA; не входить под чужим аккаунтом, не выдавать пароли, не создавать researcher membership сотруднику. При создании за исследователя владелец выбирается явно из существующих активных researcher accounts; не подменять владельца сотрудником. Данные методик/ключи/научные обработчики по-прежнему только superadministrator в отдельном workflow; admin не получает processing.manage/methods.manage. Ответы/согласия/паспорт участник заполняет сам, никаких impersonation/bypass consent/email.

Текущий малый блок 05б.1: staff-конструктор и групповые приглашения, append-only020; технические изменения проверяются до интеграции обычным current-head all6/base/tree/manifest/parents gate. Затем отдельный 05в.0: server stage availability/opening, не constructor.status=active и не автоматический календарь; 05в регистрация после этого. Принятые права не означают уже готовые endpoints этапов, enrollment, email или аналитики. Selectel/реальные данные/почтовый провайдер по-прежнему отложены. Продолжать безопасные последовательные блоки без подтверждений, не объявлять всю фазу5 завершённой.

## Уточнение фазы 5 — 2026-10-04

05а интегрированPR#34/main72edcbcc,204blobs/all6run37191056447. 05б техническипринятPR#35/runtimeaff67dfa/run37192386231:224base+115actualPG18.6 и3Chrome runs по2/2, all6success; finaldocs проходят новыйcurrent-head/base/preview/fullmanifest/parents gate перед ordinarymerge.019 group invitations —новаяappend-only, прежние018PG/SQLite/core/пакеты не переписаны. INVITATION_VALIDATION/STATUS фиксируют роли/locks/hashedtoken/CAS/audit/expiry/throttle/cap и failedCI fixture42P08→explicitbigint, без ослабленияtests. Shared token толькоcreate response, не session/contact confirmation; staff не получаетediting/contactправ. HTTPCRUD есть, participant /join/email/signup/passport/consent/QR ещё05в–05з. Следующий05в требует решения release T0/T1/T2 (вопросвладельцу: manual researcher opening или все сразу); не считатьconstructor.active разрешением этапа, не вводить календарь/напоминания/provider без решения. Независимые безопасные задачи продолжать в рамках прежней автономии. Двеизвосьми технических задачфазы5, не завершениевсейфазы; actual integration evidenceвPR.

Владелец сообщил об успешном личном входе суперадминистратора и осмотре кабинета, затем подтвердил продолжение фазы 5. Принят общий групповой invite от исследователя и индивидуальная регистрация участника email/собственный пароль/подтверждение контакта. Общую регистрацию вне приглашения и персональные ссылки как основной путь не вводить. Группа только из серверного приглашения; participant_id постоянен, контакты отдельно, исследования автоматически по email не объединять. 05а (ports/pure policy/DTO/projection) в PR#34, local224base; current-head all6/merge gate обязателен. PHASE5_PARTICIPANT_FLOW/DECISIONS/BACKLOG описывают ограничения; endpoints/миграции/почта ещё не реализованы. Pure check не замена DB locks/current identity/scope/version/mandatoryaudit. Подробные release/calendar этапов ещё требуют решения владельца. Прежние «humanhandoff не завершён» ниже — история. Реальная почтовая доставка/новые контактные права/Selectel/realdata/science отдельно; сначала synthetic тестовый адаптер. После системной перезагрузки не считать runtime запущенным без проверки; диагностика Windows ведётся владельцем в другом чате.

## Продолжение после фазы4 — локальный стенд 2026-10-03

Фаза4#32 интегрированаmain eb6af680. Владелец новым «да» разрешилlocalPG18.6synthetic stand и собственныйsuperadmin entry, затем продолжениефазы5; прежняя остановкапослефазы4 уже состоялась. LOCAL_DEMO/STATUS/BACKLOG описывают отдельныйloopbackstand/подзадачи05а–05з. Не использовать Selectel/publication/realdata/email, не менятьscience/права. Первыйличныйпароль/MFA/recovery вводитсамвладелец; до этого не заявлятьготовыйaccount/session. НеобходитьMFA/создаватьdefaultpassword/HTTPbootstrap, не публиковать.local/config/secrets. Старые4173/SQLiteсохранены. TechnicalPRmergeтолько прежнийall6current-head/base/tree/parents/manifestgate. Послеhumanhandoff продолжать05а, legal/scientificновыерешения отдельно.

## Текущая контрольная точка фазы 4 — 2026-10-03

Порученная фаза4/04а–04з реализована и технически принята:8из8.04а–04ж в main #25–#31;04з —PR#32, runtimeheade5b4a8b/[run37149537791](https://github.com/PedFund/PedPsyRU/actions/runs/37149537791):all6jobs success,202base+101PG18.6,3дополнительные независимые Chrome runs по2/2,0fail/cancel/skip. Финальные документы проходят тот же current-head CI/base/tree gate перед ordinary merge#32; не включать runtime правки в documentary head. После интеграции остановиться, фазу5 только по новому поручению. Факты/ограничения/история отказов —PHASE4_ACCEPTANCE/CONSTRUCTOR_VALIDATION/STATUS/BACKLOG; старые «фаза4 не начата» ниже исторические.

Конструктор: только researcher/свой draft/CAS, один владелец; обе staff-роли глобально читают дизайн, не редактируют. Default active quota1 атомарно проверяется при активации; draft/closed не расходуют её. Все группы/этапы/назначения планируются до activation, active/closed/attempt-bearing design заморожен. Quota override/co-ownership/active revisions — отдельные будущие workflows, не новое право. Точный existing synthetic TKI release: key_verified, полная методика publication draft, не scientific approved. Selectel/real data/publication отложены. Local4175 только UI без БД, настоящий PG/Chrome — disposable CI. После приёмки остановиться на границе фазы5.

## Историческая контрольная точка после фазы3 —2026-10-03

Порученная владельцем фаза3/03а–03з завершена,8из8 в main через#16–#23. Финальный03з merge b5c337572e7b108bf2bb9681133cf849a8126ae5, head50ad6c7b/run37140560958 все6jobs success:195base(Node22/24)+80PG18.6, включая настоящий Chrome/MFA/кабинеты/JSON download,0fail/skip. Приемка/ограничения —PHASE3_ACCEPTANCE/STATUS; следующая фаза4 разбита вBACKLOG и **не начата**. Не выполнять повторный аудит/прежнюю подготовку/историческую остановку для смены модели. Selectel **отложен владельцем**: пока только создание платформы, без оплаты/облака/publication/real accounts/data. UI-only4175/API503 отдельно от verified synthetic PG4174 вCI; старые4173/SQLite не переключены. Редактор методик/обработка/analytics/outbox остаются будущими фазами, не выдавать permission name за endpoint. Технические merge разрешены при current-head all6success/base/tree/diff; новых прав/методик/платных сервисов/публикации не добавлять самостоятельно.

## Контрольная точка после фазы2 —2026-10-03

02а–02з завершены и интегрированы через#8–#14; финальный merge4a86cb44, актуальный head5b42cce7/run37130462614 все6jobs success,179base+38PG. Итог/ограничения —PHASE2_ACCEPTANCE/STATUS; следующая разбитая фаза3 и задача03а —BACKLOG. Не начинать заново прежнюю подготовку, не применять историческую остановку для смены модели к уже переданному проекту и не переписывать проверенный core/ключ/форму. Работа только в согласованной матрице; реальные данные, новые права/методики, оплата и публикация остаются отдельными решениями. Текущие учебная SQLite/стенд4173 не переключались автоматически. Старые разделы передачи/01D4 ниже —исторические инструкции, не незавершенная задача.

## Продолжение после передачи 2026-10-03

Передача состоялась; владелец сообщил «Готово. Продолжай». Подготовительный PR #8 объединен в main обычным merge `36409eb1229b2023fd63a40668678818d7624cdc` после проверки актуального head и всех GitHub jobs. Ограничение остановки ниже относится только к завершенной подготовительной сессии; текущая модель продолжает 02в–02з автономно в согласованных пределах. Статусы — STATUS.md/BACKLOG.md.

## Уточнение владельца 2026-10-03: подготовка фазы 2 и передача модели

Фаза 1 интегрирована через PR #7. Текущая задача — подготовить фазу 2, архитектуру/матрицу доступа, контроль зависимостей и автоматические GitHub-проверки, затем **остановиться для смены модели**. Передача описана в `PHASE2_HANDOFF.md`. Текущая модель не начинает реализацию 02в–02з и не объединяет подготовительный PR #8 до передачи.

После смены модели действует прямое разрешение владельца: автономно объединять небольшие технические PR после успешных автоматических проверок в пределах согласованных архитектуры и прав. Это уже полученное разрешение удовлетворяет общему требованию отдельного разрешения на merge ниже; повторное подтверждение каждого такого merge не требуется. Проверять текущий head, совместимость с main, зависимости PR, все обязательные jobs, diff прав/методик/данных и обновлять STATUS. Не обходить падающие/пропущенные проверки. Новые права за пределами согласованной матрицы, новые методики/научные решения, платные сервисы и публикация требуют отдельного решения.

Принятые основа и права — `PHASE2_DESIGN.md`: JS/TypeScript + PostgreSQL, существующий TKI-core; Россия/Selectel; ООО «ВайбМайнд» — код/техническое администрирование, ИП Тюлин — данные/исследования. Обе административные роли читают/скачивают индивидуальные результаты, суперадмин дополнительно помогает с обработкой и управляет ручными процессами с аудитом/историей. Исследовательские агрегаты — минимум 10 участников с защитой фильтров. Согласованная цель не означает уже существующего API.

## Режим автономной разработки ПедПси

Работай автономно в рамках утвержденной архитектуры и текущего этапа разработки.

Не запрашивай подтверждения после каждой подзадачи. Самостоятельно переходи к следующим задачам, если они не требуют новых продуктовых или научно-методологических решений.

**Порядок работы:**

1. Разбей текущий этап на небольшие логически завершенные задачи.
2. Выполняй их последовательно, учитывая зависимости.
3. После реализации запускай соответствующие тесты.
4. Исправляй обнаруженные ошибки.
5. Обновляй `STATUS.md` после завершения существенных блоков.
6. Продолжай следующую задачу без ожидания подтверждения пользователя.

**Если возникло затруднение:**

- Не повторяй одну неудачную операцию бесконечно.
- После нескольких неудачных попыток установи причину проблемы.
- Если проблему можно решить технически, выбери другой подход.
- Если она не блокирует другие задачи, зафиксируй ее в `STATUS.md` и продолжай независимую работу.
- Не выполняй необоснованный рефакторинг ради решения локальной проблемы.

**Самостоятельно принимай решения:**

- о внутренней организации кода;
- о структуре функций и классов;
- о тестировании;
- об оптимизации запросов;
- об обработке стандартных технических ошибок;
- о выборе технических решений, не меняющих утвержденные требования.

**Останавливайся и запрашивай решение только если:**

- отсутствуют обязательные исходные данные;
- обнаружено противоречие в научных алгоритмах;
- требуется изменить утвержденную архитектуру;
- действие может уничтожить или раскрыть реальные данные;
- необходима оплата, изменение инфраструктуры или предоставление доступа;
- невозможно безопасно продолжить работу.

**Контроль контекста:**

- Не выполняй повторный аудит всего проекта на каждой задаче.
- Используй архитектурную документацию и `STATUS.md`.
- При затягивании одной задачи фиксируй промежуточный результат и переходи к независимым задачам.
- Не расходуй значительную часть контекста на второстепенные улучшения.
- Отдавай приоритет работоспособности основных пользовательских сценариев.

**Главное правило: не останавливайся после каждого успешного шага. Продолжай работу до завершения всего порученного этапа либо до возникновения реального блокирующего обстоятельства.**

## Текущая работа

Не прерывай уже выполняемую задачу `01D4` из-за появления или изменения этого файла. Сохраняй существующие изменения, выполняй предусмотренные для задачи тесты и продолжай работу в рамках действующих локальных инструкций.

## Работа с GitHub и Pull Request

Разрабатывай функциональные блоки автономно, без подтверждения каждого технического шага.

**Правила работы с ветками:**

1. Используй `main` как стабильную основную ветку.
2. Для разработки создавай отдельные рабочие ветки.
3. Не создавай бесконечную цепочку зависимых Pull Request. По возможности начинай новые функциональные блоки от актуальной `main`.
4. После завершения функционального блока запускай тесты и проверяй совместимость изменений с `main`.
5. Создавай Pull Request с описанием выполненной работы и результатов тестирования.
6. Не оставляй без необходимости множество завершенных, но не объединенных PR.

**Интеграция в main:**

- Самостоятельно проверяй конфликты, зависимости и результаты тестов.
- Устраняй технические конфликты без изменения утвержденных требований.
- Не используй force push для `main`.
- Не удаляй историю разработки.
- Не объединяй изменения, если обязательные проверки не проходят.
- Не включай в репозиторий персональные данные, пароли, токены и локальные базы.

Если PR готов к объединению, сообщи об этом в итоговом отчете. Самостоятельное объединение в `main` выполняй только при наличии отдельного разрешения владельца проекта.

**Контроль накопившихся PR:**

Перед созданием очередного функционального блока проверяй, имеются ли незавершенные PR, от которых он зависит.

Если цепочка PR препятствует дальнейшей разработке, сначала приведи ее в согласованное состояние.

Не создавай новые ветки от устаревших промежуточных веток без технической необходимости.

**Отчетность:**

После завершения этапа указывай:
- какие задачи выполнены;
- какие тесты пройдены;
- какие PR созданы;
- какие изменения уже находятся в `main`;
- какие PR ожидают объединения;
- есть ли конфликты или блокирующие проблемы.

Обновляй `STATUS.md` и продолжай независимые задачи без дополнительных согласований.

## Дорожная карта и фактическое состояние проекта

- Перед началом нового функционального блока ознакомься с корневым `ROADMAP.md`. Это целевой порядок работ, **не** отчет об уже выполненном коде.
- Сверяйся с актуальными `ARCHITECTURE.md`, `DECISIONS.md`, `DATA_MODEL.md`, `BACKLOG.md` и `STATUS.md` в своей рабочей ветке; эти файлы могут отсутствовать в `main`, пока их PR не объединены.
- При расхождениях между дорожной картой и исходниками различай утвержденное требование, проверенную реализацию в ветке и интеграцию в `main`. Не объявляй пункт готовым лишь по описанию в `ROADMAP.md`.
- Не замещай существующие технические документы новым общим планом. Обновляй `BACKLOG.md` и `STATUS.md` согласно результатам разработки и указывай PR.
- Незаконченная задача `01D4` имеет приоритет над административной синхронизацией документации; не останавливай ее ради одного только обновления инструкций. Перенос `ROADMAP.md` и `AGENTS.md` из `origin/main` в активную ветку делай без потери незакоммиченных изменений.

## Рациональный запуск автотестов и обязательная приемка

Цель — быстро получать обратную связь во время реализации, **не сокращая глубину окончательной проверки** и не расходуя контекст на многократные одинаковые полные прогоны.

1. **Во время разработки:** после локального изменения сначала запускай адресные unit/контрактные тесты затронутого модуля; при изменениях SQL, доступа или HTTP также адресные интеграционные проверки на подходящей тестовой среде. Исправляй обнаруженные ошибки и повторяй нужные тесты. Если безопасный адресный запуск невозможен, используй полный соответствующий набор.
2. **Перед публикацией PR или после завершения существенного блока:** запускай весь доступный локальный регрессионный набор, сборку, проверку типов, архитектурных границ, синтаксиса и зависимостей. Фиксируй реальные результаты, отдельно указывай тесты, которые локально не запускаются.
3. **Перед объединением PR:** обязательны действующие проверки GitHub Actions **для актуального head-коммита** и соответствующего актуального base: весь предусмотренный PostgreSQL integration suite на реальном движке, браузерные E2E, проверки безопасности, зависимостей и секретов, а также предусмотренные проектом gates совместимости, manifests и сохранности критических файлов. Не подменяй их локальными тестами, прежним зеленым CI или отчетом модели.
4. **После устранения ошибки или изменения head:** повторяй все проверки, на которые влияет изменение; перед merge выполняй полный обязательный current-head CI. Ошибки и отмены не выдавай за успех.
5. **Если тест не прошел:** сначала определи, ошибка в production-коде, тестовых данных, тесте или среде; исправляй причину. Не ослабляй ограничения безопасности, научные инварианты, критические assertions, пороги и обязательные jobs ради зеленого статуса. Важные дефекты добавляй в регрессионные тесты.
6. **Оптимизация:** переиспользуй уже проверенные неизмененные результаты при локальной отладке, где это безопасно; избегай повторных полных прогонов после каждой мелкой правки, но **не пропускай обязательную итоговую приемку**.
7. **Отчет:** раздельно записывай число локальных unit/регрессионных тестов, actual PostgreSQL-сценариев и браузерных E2E, а также статус GitHub Actions и SHA проверенного коммита. Не суммируй повторы и тесты разных конфигураций как новые уникальные сценарии без пояснения.

Для учебного контура используй исключительно синтетические данные. Не подключай реальные персональные данные, рабочий сервер или внешние почтовые сервисы без отдельного разрешения владельца. Работа Codex остается автономной в пределах утвержденного этапа.
