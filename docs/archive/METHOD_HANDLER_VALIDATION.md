# 06а.3 — привязка обработчика и выполнение контрольных примеров

Основа — mainbb2bb115245e0effaa13abbb410a130c09c125ef/PR#55:
all-six run37603815117,338base на каждой Node22/24,294actualPG18.6,
три независимых extraChrome по5/5,0fail/cancel/skip. Actual334blobs,
parents/tree/319unchangedbase/old45critical проверены; два новых draftJSON
дают47protected paths. Это приёмка черновика Карпова, не его научное утверждение.

## Реализация

`verifyMethodHandler` принимает исходный JSON и trusted host dependencies,
заново выполняет structural validation и actual artifact integrity. Не принимает
deserialized evidence, scientific/publication authority или executable от клиента.
Static registry содержит ровно действующий TKI; неизвестный handler и Карпов
возвращаются unsupported с сохранением handler_not_verified, не регистрируются.

Два fixed first-party file paths читают существующие form.json/key1.0.0.
Byte SHA256 pins взяты из этих файлов, не из присланного пакета. Trusted release
проверяет existing corrected key/calculation digest; форма также сверяется с
canonical snapshot. Изменённые bytes (даже whitespace при новом заявленном SHA),
version/answer text/order/schema/scale labels/bounds/direction/calc type/handler
отклоняются. Package version — версия draft descriptor, не замена pinned
method_version_id tki_ru_30_pairs@1.0.0 / handler tki-contract-0.3.0.
Norms evidence не принимается этим static TKI binding; разрешён только absent.

Проверяются complete raw results current handler: scored/no warnings/no
classifications/complete30/usable/keydigest/exact five codes+labels/raw integers
0..12/sum30. Каждый submitted synthetic vector сравнивается точно с actual
result, без округления/подмены expected. AllA/allB =6,6,6,6,6; alternating
startingA =7,9,7,4,3. Эти три значения — прежняя regression база, не новые нормы.
Нулевое число vectors не снимает handler_not_verified (no vacuous proof).

Положительный output остаётся structurally_valid_draft/publishable:false,
review technical unverified/scientific draft/publication draft. Handler evidence
отдельно pinned + список исполненных vectors; отсутствующие материалы и
artifact_content_not_validated/scientific/publication/rights blockers остаются.
control_basis_review_required сохраняется даже при claimed independent:
исполнение JSON-ожидания не доказывает независимое происхождение источника.
Содержание instruction/specification/extra artifacts не утверждается научно.
Ошибки mismatch нейтральны; ошибки trusted providers нейтральные503 без
частичной положительной evidence/private text. Registry immutable; buffers
scoped copied через уже принятый integrity boundary, повторного чтения
пользовательских артефактов при scoring нет.

## Проверки и история

8 новых test groups: actual binding/threevectors/freeze/blockers; substituted
form/key with ownSHA; handler+form+metadata compatibility; plausible wrong
expected/answer; emptyvectors/claimedindependent; unsupported Karpov;
forged DTO/providers/tamper; no dynamic execution/path/network/approval.
Address8/8/build/typecheck/architecture/syntax/dependency policy passed.

Первый полный local346:344passed,2failed,0cancel/skip. Captured final window
содержал fetch failed in tests/web-server.test.js setup (initial GET/api/form);
подробности второго failure обрезаны tool output и не восстановлены. Причина
не установлена; не объявлять это исправленным production defect/доказанной
Windows/network причиной. Existing unchanged targeted web-server suite9/9
passed, captured repeat full346/346 passed0all без изменения runtime/tests.
Current-head independent all-six CI всё равно обязателен доordinarymerge;
история первой ошибки сохранена, не выдана за успешный прогон.

PG expected294/extraChrome5/5×3 — регрессия существующей платформы, НЕ новая
library persistence/HTTP/UI. New8groups увеличивают base338→346, повторы
Node22/24 не суммируются как уникальные сценарии. No47critical change:
old core/TKI key/form/releases/SQL001–030/npm manifests/workflow plus new
Karpov draftJSON preserved. No deps/HTTP/auth/SQL/scientific approval/clinical
new release/stand restart/ownerkeys/MFA/real data/mail/Selectel.

Послеaccepted06а.3 — отдельный06б versioned private library persistence:
actual current superadmin+freshMFA, locks/CAS/audit/immutable versions/
actualPG private ACL/races/backup/upgrade. Ни success handler test, ни новая
draft table не разрешает публикацию методики автоматически.
