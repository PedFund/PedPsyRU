# 05б.1: проверка MVP-управления исследованиями сотрудниками

Дата: 2026-10-04. Прямое решение владельца: администратор и суперадминистратор могут выполнять управление исследованиями за исследователя во всех исследованиях MVP. Ручное открытие этапа принято отдельно по каждой группе, но server availability — следующий05в.0, не готовый endpoint этого блока.

## Подтверждённая техническая приёмка

[PR#36](https://github.com/PedFund/PedPsyRU/pull/36), runtime head `ce594173d82e60ef2b1387397baed8607c29dae7`, tree `7e0bbede99944da5429426ad8987110a5c68bb28`, [run37195401170](https://github.com/PedFund/PedPsyRU/actions/runs/37195401170): все6jobs completed/success.225/225 base Node22/24,124/124 actual PostgreSQL18.6 (9новых), три дополнительные независимые Chrome runs по2/2;0fail/cancel/skip. Подтверждены SQL, HTTP и реальный браузер, не только pure policy.

Последующие финальные Markdown проходят **новый** current-head CI/base/merge-preview/tree/parents/fullmanifest gate перед обычным merge. Actual integration evidence записывается в PR; runtime success сам по себе не доказывает merge.

## Проверенные границы

| Сценарий | Подтверждённый результат |
|---|---|
|Обе staff-роли: createFor → группы/update → этап/update → assignments → copy → title → activate → invites/list/revoke → close|Работают через staff HTTP, study остаётся у выбранного owner, audit содержит фактический credential/роль/study/resource|
|Создание для исследователя|Только явно выбранный существующий active researcher/user; чужой researcher token, unknown/blocked owner отвергаются; staff-owned membership/session не создаётся|
|Researcher +staff race: две активации одного owner|Ровно одна active, второй STUDY_QUOTA; квота owner не обходится менеджером|
|Researcher +staff race: один design version|Ровно одна запись, второй DESIGN_CONFLICT; frozen active/closed/attempt-bearing design сохраняется|
|MFA/realm/CSRF/origin|Stale MFA требует recheck, revoked staff401, переименованные cookie не меняют realm; CSRF/origin403, duplicate cookie нейтрально401|
|Отзыв staff во время credential-lock wait|После ожидания текущая личность проверяется заново: запись и allow audit не появляются|
|Удаление owner membership во время study-lock wait|Pre-read не authority; после ожидания404, title/version/allow audit неизменны|
|Сбой обязательного staff audit|Creation/membership/title/version откатываются; нейтральный HTTP error, не частично сохранённое состояние|
|Creator приглашения|Researcher FK сохранена, staff creator отдельной FK; CHECK ровно одного creator и immutable trigger запрещают подмену|
|Настоящий upgrade019 →020|Ранее сохранённое researcher приглашение byte-value intact, новый staff field NULL; миграции повторяемы, runtime direct table/private helper access закрыт|
|Chrome administrator create/edit/reload|Выбранный owner, сохранённая группа/title/version2, повторный вход/перезагрузка видят серверное состояние, real actor audit подтверждён|
|Не расширенные права|Admin methods.manage/processing.manage/staff.roles.assign denied; staff не записывает participant answers, нет impersonation/выдачи чужих паролей/нового contact доступа|

## Архитектура и сохранность

Append-only020, прежние PostgreSQL001–019 и SQLite migrations не изменены. Существующие core/form/key/fixtures, package/lock/workflow blobs сохранены. Нет новых зависимостей/провайдеров/облака. SQL работает только через фиксированные guarded функции; tables/private helpers не выдаются runtime. Staff management locks → owner credential/user →study/membership →group/invite; owner credential сериализует квоту с researcher writes. Реальный actor не подменяется владельцем.

Технически недопустимая/неоднозначная owner связь не угадывается: staff write требует существующего единственного researcher owner. Уже заблокированного owner можно административно контролировать/закрыть в существующем исследовании; создавать ему новое нельзя. Coownership/quota override/пересмотр active design не вводятся.

## История проверки без ослабления защиты

Initial head `925b8d5b1803d0eccc3e9d2d779de8e977b0a90a`/[run37194884293](https://github.com/PedFund/PedPsyRU/actions/runs/37194884293):116/121PG,5fail, Required checks failed, **не merged**. Два старых staff-denied expectations обновлены согласно новому прямому решению владельца; отрицательные science/processing/participant проверки сохранены. Duplicate-cookie ожидает401 после trusted realm gate, не доступ. Stale-MFA fixture согласует created_at/MFA с прежнимCHECK; Chrome label укорочен до прежнего50-char allowlist. CHECK, MFA, role guards и browser allowlist не ослаблены. Добавлены ещё3 actualPG migration/current-lock cases, итог124/124.

## Оставшиеся ограничения

Только synthetic. Старый локальный owner stand не запускался/не мигрировался и секреты не читались; опубликованный код не означает уже обновлённый локальный процесс. 05в.0 stage opening,05в signup/email/login,passport/consent/enrollment/участнический UI ещё следующие блоки. Group invitation остаётся reusable recruiting token, не session/contact confirmation. Ни реальные email/данные, ни Selectel/publication/scientific approval не выполнены. Исследовательские individual данные остаются закрытыми; aggregate N>=10/anti-differencing — будущая реализация.
