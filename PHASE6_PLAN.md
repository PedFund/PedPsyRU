# Фаза 6 — централизованная библиотека методик

## Разрешение и безопасный старт, 2026-10-07

Владелец явно поручил начать фазу6. Историческая остановка после фазы5 выполнена
и новым поручением отменена; остальные границы безопасности сохраняются.
Основа: принятая main29932a6781eebcc1bc696acf23fefad438ba96d5, PR#52 /
run37591582200 all-six success,313base Node22/24,294actualPG18.6,триChrome5/5.
Новая фаза не означает разрешение scientific publication/новых норм/прав,
реальных данных/почты/Selectel или перезапуска ownerstand/MFA.

## 06а — фактический реестр и контракт пакета

Существующий аудит не выполняется заново. Проверен текущий исходный реестр:
24 builtin +12standard +14tanit =50 обработчиков. Источники — локальные
methods.js/methods/builtin.js и два method-packages JSON, без чтения XLSX/PII.
METHOD_IMPORT_INVENTORY.json содержит только IDs/names/types/items/provenance
и независимые статусы, не ключи, формы или нормы. Все non-TKI записи inventory_only,
не утверждены научно и не доступны исследователю как релизы новой платформы.
Паспорт может отставать; состав подтверждается исходниками, а не его давностью.
TKI используется только из действующего пакета PedPsyRU; legacy ключ не копируется.

Контракт следующего маленького блока: method_id, package_schema_version,
package_version, provenance/source citations, rights review, instruction/form,
item IDs/answer types, scale IDs/specification, key/scoring adapter reference,
explicit norms basis or absent, independent control vectors, artifact digests
и отдельные technical/scientific/publication statuses. Не выполнять произвольный
импортированный JS/формулу; архив/path traversal/ресурсные лимиты fail closed.
Контрольные примеры синтетические; успешный validator не scientific approval.

## Последовательность проверяемых блоков

Владелец выбрал следующий реальный импорт после TKI: **Карпов — рефлексивность,
27 вопросов** (`reflexivity_karpov_27`). Черновик из existing source; scientific,
norms, rights/publication остаются отдельной проверкой и решением. Отсутствующие
текст/инструкция/контрольные исходники не восстанавливаются догадками.

|Блок|Результат|
|---|---|
|06а Реестр/контракт|Фактический metadata registry + versioned package schema/validator, positive/negative tests|
|06б Библиотека в БД|Private versioned draft metadata/artifact references, current superadmin/MFA/audit/CAS; researcher только approved выпуски|
|06в Чтение через API|Bounded whitelist catalogue/detail; admin/researcher/participant не получают научные управляющие права|
|06г Управление draft|Superadmin create/update draft через browser; immutable used versions, исправление новой версией|
|06д Первый импорт|Действующий TKI пакет без переписывания key/form/processor и без возврата старого ключа|
|06е Импорт иных типов|По одной методике: sums/reverse/special algorithms, независимые vectors/источники/права; отсутствие данных явно блокирует конкретный импорт|
|06ж Подготовка новых материалов|Внешний воспроизводимый конвейер PDF/DOCX/XLSX → draft package; missing/conflicts отмечаются, не угадываются|
|06з Приёмка|Actual PG/HTTP/browser/roles/races/immutable versions/backup/CI/manifests; журнал METHOD_VALIDATION|

План не утверждает научный результат или конкретную библиотеку parser/OCR.
6А и6Б проверяются на нескольких типах; новые method sources/scientific decisions
и правомерность распространения потребуют владельца. При отсутствии материалов
продолжать независимую техническую библиотеку, не заменять их догадками.
Каждый небольшой блок: адресные tests → полный доступный local regression →
current-head all-six actualPG/nativebrowser/currentbase/preview/manifests → ordinary
technical merge. Ниже scientific/method publication approval не автоматизируется.

## Модель разработки

Рекомендация владельцу: GPT-6.1 Sol/medium для обычных небольших технических
блоков. High — при сложной отладке доступа/миграций/архитектуры и спорных расчётах;
это выбор уровня рассуждения, не замена контрольным примерам/источникам/owner approval.
Автоматическое переключение модели не выполнено. Источники рекомендации:
https://developers.openai.com/api/docs/models/gpt-6.1-sol
https://developers.openai.com/api/docs/guides/reasoning

06а разделён на06а.1 structural draft contract/inventory и06а.2 actual artifact/
static handler verification. Сейчас06а.1 локально реализован: typed submission1.0,
pure JSON validator/deepfreeze/publishablefalse,11new test groups/324base.
Финальный повтор после code-review linear scanner обязателен перед публикацией;
actual current-head CI/PG/browser ещё не выполнен для нового кода.
Новые migrations/API/editor/imports/approved releases ещё НЕ реализованы.
Следующий блок06а.2 проверяет actual bytes/digests и handler/control execution
через trusted порты, без scientific approval/произвольного импортированного JS.
