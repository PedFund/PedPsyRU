# Фаза 5 — техническая приёмка участнического контура

2026-10-07. Восемь основных блоков реализованы; runtime интегрирован через
PR #34–#51. Этот завершающий документ 05з интегрируется только после собственного
полного current-head CI и проверки совместимости с актуальной main.
Итоговая интеграция и SHA фиксируются в PR приёмки, не предполагаются заранее.
Приёмка ограничена синтетической разработкой; реальный пилот не разрешён.

## Восемь блоков и проверяемый результат

|Блок|Результат|PR|
|---|---|---|
|05а Контракты|Раздельные приглашение, контакт, вход, паспорт, согласия и допуск; строгие DTO|#34|
|05б Приглашения|Общая ссылка группы, digest-only token, срок, отзыв, CAS, лимиты и аудит; собственные staff actors|#35–36|
|05в Регистрация и допуск|Ручное открытие этапа по группе; scoped email/password и подтверждение контакта; атомарный допуск с текущими guards|#37–41,#47–49|
|05г Схема паспорта|Версионированная схема; обязательные пол/возраст, настраиваемый город, максимум пять дополнительных вопросов; frozen/CAS|#42|
|05д Собственный паспорт|Один вопрос на странице; серверное сохранение черновика, явное завершение и неизменяемый результат|#43–44,#50|
|05е Согласия|Раздельные purpose/version/currentpolicy; явное принятие, фактический credential и серверное время|#45–46,#50|
|05ж Интерфейс и QR|Общая ссылка → индивидуальная регистрация → TKI; один вопрос/слайд, восстановление; QR без внешнего сервиса|#50–51|
|05з Приёмка|Сверка реального CI, PostgreSQL/HTTP/Chrome, гонок, восстановления, ролей, manifests и ограничений|Этот отчёт и его final CI|

## Принятый сценарий

Исследователь составляет дизайн и настраивает паспортичку до активации,
создаёт приглашение группы и вручную открывает этап отдельно по группе.
Администратор и суперадминистратор выполняют эти действия за существующего
исследователя своими staff-сессиями с актуальной MFA и аудитом, без impersonation.
Замороженный active/closed/attempt-bearing дизайн, квота владельца и CAS сохраняются.

Участник приходит по общей групповой ссылке, сам задаёт email и пароль,
отдельно подтверждает контакт. Свободной регистрации вне исследования нет.
В учебном контуре подтверждение использует synthetic test receipt — не реальную
доставку письма. PID и группа закреплены внутри study; email не объединяет людей
между исследованиями и не переводит между группами. Повторный собственный вход
возвращает прежнее участие. Отзыв приглашения и исключение участника различаются.

Паспорт пока содержит sex/age/city, а не весь будущий каталог. Пол и возраст
обязательны; город и до пяти extra text/integer/single_choice вопросов настраивает
исследователь. Собственные значения вводит только участник; пустое не заменяется0.

Contact и study participation обязательны; secondary_research отдельно добровольное
по прежнему решению. Контактное подтверждение не создаёт study/science acceptance.
Версии и время фиксируются неизменно, при новой policy требуется новое явное решение.
Учебные тексты не юридические документы. Нет кнопки отзыва/самостоятельного возврата;
обращения оператору отдельно без автоматического удаления — не юридическая
неотзывность и не разрешение бессрочного хранения.

Допуск требует текущих identity/group/contact, завершённого паспорта, обязательных
согласий, manually opened own stage и актуальных назначений/релизов. SQL независимо
перепроверяет authority под locks с fresh wall-clock; клиентские flags не разрешение.
Enrollment, immutable basis, attempts и обязательный аудит атомарны. Повтор сохраняет
исходные IDs/time/data; нет fake T0, reactivation исключённых или backfill оснований.

TKI показывает ровно одну пару на слайде. Ответы, revision и current item сохраняются
на сервере; reload восстанавливает вопрос. Завершение явно только после30ответов.
Original core/key/form/scoring не переписаны;21B — сотрудничество. Пять исходных
шкал/sum30 не выдаются за новую норму или доказанную научную валидность.
Обе actual MFA staff роли глобально читают/скачивают ответы и индивидуальные результаты;
индивидуальная диагностика исследователю этим блоком не открывается.

## Фактические доказательства

|Принятый блок|Source head / successful run|Node22 и24, каждый|Actual PostgreSQL18.6|Extra Chrome|
|---|---|---|---|---|
|#50 UI|f16d704c / [37312700977](https://github.com/PedFund/PedPsyRU/actions/runs/37312700977)|308/308|294/294|Три по5/5|
|#51 QR|f6046181 / [37589156038](https://github.com/PedFund/PedPsyRU/actions/runs/37589156038)|313/313|294/294|Три по5/5|

Все шесть jobs success, все test fail/cancel/skip=0. Каждая строка — отдельный
head, не суммируется как новые уникальные сценарии. Браузерные5 входят в294
основного PG suite;5×3 дополнительных прогонов — обязательные повторы.
Финальный documentary head требует заново всех шести checks, не наследует green.

#50 main `ae2fd073860b2540ad2f1ee7fc1ba3e8c603fa08`: source/base/preview/parents/
all311/292unchanged и postmerge tree/parents/all311 проверены;45critical —44 unchanged
и точное overall PG workload budget15→20min исключение, без изменения guards/tests.
#51 main `5b1f7ea014f9f738b1e376549c607c5c7a1a6d08`, tree
`12608d5299444a5d1e9332761ba575607c11aff0`: source/base/preview/parents/all315/
298unchanged и actualmain parents/tree/all315 verified.43of45critical unchanged;
точное package/lock исключение — один reviewed QR2.0.4; все старые lock entries
неизменны. SQL001–030/core/releases/workflow/MFA/ownerstand в QR не изменены.

Actual suites покрывают invitations, registration start/receipt/confirmation/login,
stage access, schema/passport, consents, discovery/admission/current clinical RLS,
HTTP, native Chrome, staff diagnostics/MFA, snapshot/backup/upgrade. Проверены
concurrency/lost-response/idempotency, stale CAS, revocation/close during lockwait,
wall-clock expiry, forged GUC/direct RLS, audit rollback, private ACL/PUBLIC deny,
scoped FK и отсутствие impersonation/backfill/zero imputation. Nonempty pg_dump/
restore сохраняет outbox с отдельным retained key, паспорт, документы/согласия,
admission/attempts и восстановленные private ACL; append-only upgrades сохраняютIDs.

Native browser проверяет полный synthetic signup/contact/password/passport/explicit
consent/manual stage/one-pair/reload/all30/rawresult; researcher five extras/frozen/
sharedlink/QR; malformed/closedgroup с actual staffcookie без privileged page.
Прежние два browser cases сохранены. QR matrix/SVG/hide/reread/storage assertions
не независимый decoder и не сканирование Android; полная MIT licence и pinned
dependency review — THIRD_PARTY_NOTICES/QR_VALIDATION/SECURITY_AND_DEPENDENCIES.

История failures сохранена в validation journals и STATUS, не удаляется ради
зелёного отчёта. Среди последних: unknown first local283/285 (#47), cancelled
общий10min budget (#46), QR metadata exports и production require.resolve scanner
refusal (#51). Повторный успех не объявляется доказательством причины неизвестной
ошибки. Assertions/requiredjobs/security/scientific инварианты не ослаблялись.

## Ограничения и передача

Локально final QR313/313/build/types/architecture/syntax/dependency policy прошли;
npm audit0. PG/Chrome выполнены в GitHub disposable среде, не на ownerstand.
Локальная папка без `.git`: состояние подтверждается connector refs/raw manifests,
не выдуманной cleanbranch. Ordinary merges только после полного gate, без force,
reset, удаления истории, массового merge. Ownerstand/MFA/passwords/keys не менялись.
Loopback QR127.0.0.1 не открывает компьютер с телефона; сеть/hosting не включены.

Реальный пилот требует отдельных решений: real email/delivery/recovery/emailchange,
операторские обязанности/договоры/правовые документы/несовершеннолетние/основания/
retention/внешние обращения; deployment/keys custody/backups/disaster recovery/
monitoring/security review. GitHub не хранилище реальных контактов/диагностики.
Selectel, оплата, реальная почта/данные и публикация не выполнялись. Independent
pentest, scientific validity и legal/production acceptance не заявляются.

Будущие блоки: полный passport catalogue; библиотека/редактор методик/processing/
helpqueue/autopilot; aggregates≥10 с anti-differencing; reminders/jobs/calendar;
coownership/quotaoverride/active revisions. TKI key_verified, полный scientific
package publication draft. После ordinarymerge этой приёмки **остановиться перед
фазой6**; не добавлять новую методику, права, доставку или реальный пилот автоматически.
