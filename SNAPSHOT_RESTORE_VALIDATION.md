# 02ж — снимок учебных данных и восстановление

Дата2026-10-03. Седьмая из восьми задач фазы2; codex/phase2-snapshot-restore от main@597c3cf9 (#12).

## Контракт и безопасность

`exportDemoSnapshot` читает фиксированные14domain tables в read transaction, проверяет SQLite integrity/FK, demo/synthetic provenance, canonical snapshot/items/key/version, полные completed/results/digest и расчет неизмененным scoreTki. Формат pedpsy-demo-snapshot-1; canonical JSON SHA256 сохраняет устойчивые UUID, UTC даты, safe revisions и JSON-значения, а не строковое представление PGjsonb. Пароли/credentials/sessions/throttles/audit не переносятся. Demo flag не дает разрешения отправлять произвольные настоящие данные в CI; тесты только вымышленные.

`importDemoSnapshot` — offline migrator-owner operation, не HTTP endpoint. Только пустой domain/auth target; никакого overwrite/repair/слияния. Одна транзакция/advisory lock. Completed snapshot вставляется как draft с input_revision, затем ответы/result и штатный guarded переход completed; triggers не отключаются. Полное сравнение exported/imported canonical digest до commit, SQL/FK/verification failure → rollback. Источник не мигрируется и не изменяется; исходная SQLite остается самостоятельным rollback-контуром, обратной синхронизации нет.

Локально исходная `.local/training.sqlite` открыта только readOnly: 2studies,6participants,18attempts,4responses,0results. Снимок подтверждает структуру, не completed migration; completed acceptance использует отдельный synthetic source с результатом. SHA256 байтов источника до/после чтения совпадает; данные и база в Git не включаются.

## Настоящий backup/restore test

CI использует pg_dump/pg_restore из того же закрепленного PG18.6 service container; не несовместимый системный клиент другой версии. `pg_dump --format=custom` → in-memory trusted synthetic PGDMP archive → новый пустой `pedpsy_ci_<generated>` target с `pg_restore --single-transaction --exit-on-error --no-owner --no-privileges`. Нет --clean, overwrite чужой базы, отключения guards, передачи исходной базы или загрузки backup artifacts. Полная схема/данные восстанавливаются штатным порядком PG restore.

Restore проводится offline/quarantine. Поскольку --no-privileges не сохраняет ACL, перед допуском runtime явно отзываются PUBLIC schema/table/function/migration grants и public CREATE, затем применяются минимальные `grantRuntime`. Проверяются полное равенство данных/result/digest, повтор миграций/checksum0, отсутствие sessions, отсутствие PUBLIC execute, anonymous RLS denial, запрет чтения credentials и immutable result. Это не production backup/PITR или согласованные RPO/RTO.

3 локальных snapshot tests +3 PostgreSQL import/rollback/backup scenarios; с прежними 27 всего30PG scenarios. Реальное выполнение PG/pg_dump/pg_restore подтверждает только актуальный CI; local Windows без этих инструментов не объявляется engine proof. Обязательные jobs не обходятся. Подробности формата восстановления — [pg_dump](https://www.postgresql.org/docs/18/app-pgdump.html), [pg_restore](https://www.postgresql.org/docs/18/app-pgrestore.html).

## Операционный порядок будущего переноса

1. Только утвержденный synthetic source или отдельно разрешенный защищенный контур реальных данных. Offline/readOnly source; зафиксировать файл/контрольные суммы, не публиковать содержимое.
2. Мигратор применяет append-only migrations в отдельной БД; runtime role отдельно, ограниченные credentials создаются заново.
3. В пустой target импортировать проверенный snapshot, сопоставить counts/UUID/даты/версии/digest/result, проверить auth/session0. При ошибке target не включать, source сохраняется.
4. Сделать защищенный backup; восстановить в другой новый offline target из доверенного архива, вернуть ACL, повторить checksum/data/rights tests до открытия трафика.
5. Не переключать4173/реальный API автоматически; новое API/E2E —02з, production/Selectel и реальные участники отдельно.
