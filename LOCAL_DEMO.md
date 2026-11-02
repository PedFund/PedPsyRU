# Локальный учебный стенд и первый суперадминистратор

## Новая регистрация 05в.3б пока не включается в owner stand автоматически

HTTP feature требует явного `PEDPSY_CONTACT_DEMO=1` и отдельного canonical base64 32-byte nonzero `PEDPSY_CONTACT_KEY`, отличного от existing `PEDPSY_MFA_KEY`. Здесь указаны только имена переменных, не реальные значения. Без валидного набора registration routes отвечают 503; прежние staff/MFA routes остаются доступны. Ключ сохраняется отдельно от operational PostgreSQL backup и MFA key; менять его молча нельзя, иначе прежняя encrypted outbox/nonce станут недоступны. Эта задача не генерирует ключ, не меняет local config, не запускает/мигрирует owner PG и не сбрасывает MFA.

До безопасного отдельного upgrade со сверкой backup/retained keys owner stand остаётся на своей прежней схеме. Новые HTTP/PG проверки выполняются только на disposable synthetic CI, не на вашей базе. Нет real mail/provider/реальных участников; synthetic receiver не подтверждает реальное владение ящиком. Browser registration UI будет отдельной задачей 05ж, текущая HTTP-композиция не добавляет кнопки регистрации в кабинет.

2026-10-03. Владелец отдельно разрешил локальный PostgreSQL и собственный вход суперадминистратора. Это **не Selectel, не публичный запуск и не разрешение реальных исследовательских данных**. Старые4173/SQLite сохранены;4175 остаётся отдельным UI-only preview. Рабочий PostgreSQL кабинет: `http://127.0.0.1:4174/workspace`.

## Подготовленная среда

Portable PostgreSQL18.6 Windows x64, без installer/системной службы/pgAdmin/изменения PATH. Источник —[официальная страница PostgreSQL Windows](https://www.postgresql.org/download/windows/), её [EDB binaries](https://www.enterprisedb.com/download-postgresql-binaries), наблюдаемый Windows18.6 link `https://sbp.enterprisedb.com/getfile.jsp?fileid=1260609` перенаправил на `https://get.enterprisedb.com/postgresql/postgresql-18.6-5-windows-x64-binaries.zip`. Получено384620317bytes по HTTPS; локальный SHA256 `e2246ba91d22345bc3d017586c09ede52d9df180b1eeb480f050445f1cad84e2` —идентификатор полученного файла, **не независимо опубликованная vendor-checksum**. `postgres.exe` не имеет Authenticode подписи; происхождение основано на официальной цепочке ссылок/HTTPS, не на выдуманной signature verification. Version output: PostgreSQL18.6. Извлечены только bin/lib/share и server/CLI licenses,1585files; архив сохранён локально.

`.local/demo-stand` защищён Windows ACL только текущего OS-пользователя, inheritance отключён; это не защита от компрометации того же OS-аккаунта/администратора машины. Cluster/config/logs/secrets не публикуются. Сервер PG слушает только127.0.0.1:55432, HBA толькоSCRAM/IPv4loopback, без trust. API —127.0.0.1:4174. max_connections40, API pool4. Statement/error-parameter logging отключены, SQL ошибки CLI не выводят message/detail/cause.

Controlpostgres используется только offline для создания новой БД/ролей. Отдельный nonsuperuser owner владеет schema; отдельный runtime —NOSUPERUSER/NOCREATEDB/NOCREATEROLE/NOINHERIT/NOBYPASSRLS, без membership/ownership. Runtime config не содержит owner/control secret. App child получает только runtime и отдельный32byte MFA vault key; PGTEST/прочие PG/PEDPSY vars удалены из inherited env. Это локальная key custody, **не production rotation/recovery plan**. Не удалять/публиковать runtime.json: потеря MFA key лишит возможности расшифровать факторы.

Применяются существующие checksum migrations001–018/grantRuntime. Fresh in-memory synthetic seed переносится существующим verified snapshot importer в пустую новую `pedpsy_demo_<16hex>`DB. Старый SQLite не читается. Две вымышленные studies/КГ/ЭГ/T0–T2; seed не создаёт credentials/sessions. Новый init отказывается от существующей standdirectory; повторный import —от непустой БД. Ошибка сохраняет частичную среду для диагностики, не выполняет DROP/recursive delete/repair/reset.

## Личный первый вход

В обычном интерактивном PowerShell в корне проекта:

```powershell
./scripts/local-demo.ps1 -Action Account
```

Введите **собственный уникальный пароль** дважды в masked prompt: минимум12символов, максимум256UTF8bytes. Не отправляйте пароль в чат, командные аргументы, env, файлы, GitHub или логи. PowerShell передаёт его только по stdin дочернему Node; временные BSTR очищаются, ссылки на plaintext убираются. Полного гарантированного уничтожения managed strings в памяти JS/.NET это не обещает. Login фиксирован: `PEDPSY-OWNER`.

Команда использует прежний `passwordRecord`/scrypt и `bootstrap_first_superadmin`: schemaowner/имя synthetic DB/advisory lock/first-use guard/mandatory audit. HTTP/startup/runtime не получают provisioning. Повтор не сбрасывает пароль, не создаёт второго staff и не заменяет аккаунт. Перед этой человеческой командой **личного staff account нет**; synthetic tests создают отдельные disposable accounts только в своих CI databases.

Затем откройте `http://127.0.0.1:4174/workspace`, выберите «Администратор / суперадминистратор», код `PEDPSY-OWNER`, свой пароль. Подключите собственный authenticator по показанному секрету и подтвердите текущим кодом. Сохраните recovery codes **лично и вне чата**. Password pending не является staff session; MFA не обходится. Не показывайте экран секретов/кодов в чат и не разрешайте сохранение credentials в browser без личного решения.

## Повторный запуск/остановка

```powershell
./scripts/local-demo.ps1 -Action Start
```

После получения нового кода сначала сделайте резервную копию локальной синтетической базы, затем примените новые миграции без повторного создания стенда:

```powershell
./scripts/local-demo.ps1 -Action Upgrade
```

Команда сохраняет существующие локальные данные и повторно выдаёт runtime-роли только необходимые права.

Start при необходимости запускает уже созданный PGcluster, затем существующий приложениеbootstrap с runtime role. Не мигрирует, не seed/provision при каждом входе. Перед новым Setup нужен `npm run build` и официальные binaries в `.local/pg18-portable/pgsql`; Setup уже выполнен на этой машине, **повторять его не нужно**.

Закройте процесс API обычным Ctrl+C, затем при необходимости:

```powershell
./scripts/local-demo.ps1 -Action Stop
```

Stop штатно останавливает только этот cluster, ничего не удаляет. После перезагрузки Windows службы нет; используйте Start. Локальная разработка только с вымышленными ответами; не вводить настоящий email/паспорт/диагностику. Научный TKI publication всё ещёdraft, key_verified.

## Проверки и границы

205/205base tests/build passed. Architecture/dependency/typecheck/JS syntax/PowerShell syntax passed. Два новых actualPG18.6 tests: fresh verified seed/zero auth/repeat refuses overwrite; audited owner bootstrap/one-use/runtime denied/password only pending/denied staff session. [PR#33](https://github.com/PedFund/PedPsyRU/pull/33),runtimehead5464b760/[run37152592115](https://github.com/PedFund/PedPsyRU/actions/runs/37152592115):все6jobs completed/success,205baseNode22/24+103actualPG18.6,3дополнительных независимыхChrome runs по2/2,0fail/cancel/skip, реальныйbackuprestore вPGjob. Finaldocuments проходят повторный current-headCI/tree gate, прежний CI не переносится на новый head. Windows cluster installation/ACL/interactive masked input нельзя объявить проверенными LinuxCI: создание cluster/seed/owner-runtime separation выполнены локально, окончательный личный пароль/MFA вводит владелец.

Локально выбранный97-testPGнабор после освобождения4174:97/97,0fail/cancel/skip. Первый96/97 иfocused7/8failedrun документированы: EADDRINUSE из-за нашего работающего кабинета, не scientific/authрегрессия. Только APIпроцесс остановлен/перезапускается, данныеPGсохранены; tests не измененырадиgreen. Snapshot/Docker и реальныйChrome остаются отдельными обязательными LinuxCIпроверками, не skippedlocaltests.

Фаза5 разбита вBACKLOG, но пользовательское завершение первого входа пока human hand-off. Обновлять статус только после подтверждения входа, не считать открытый login screen успешной аутентификацией.
