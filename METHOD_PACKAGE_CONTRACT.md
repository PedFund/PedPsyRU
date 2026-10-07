# Пакет методики — контракт submission 1.0

Это структурный контракт черновика, а не разрешение исполнения/публикации.
Нормативная структура — `src/ports/method-package.ts`; исполняемый pure validator —
`src/application/method-package-validation.ts`. Не заявляется JSON Schema validator
внешней библиотеки: новые зависимости не добавлены.

## Вход и выход

Вход — только JSON string, <=262144 UTF-8 bytes, nesting<=16. Unknown/duplicate
keys (включая escaped aliases), prototype keys, неверные типы/версии/ссылки,
неограниченные числа/контрольные символы отвергаются нейтральным400
`INVALID_METHOD_PACKAGE`, без вывода входных значений. JSON не исполняется.

Выход — deep-frozen `structurally_valid_draft`, полный неизменённый JSON package,
отсортированные blockers и **publishable:false**. Нет caller authority, изменения
ролей/сессий, SQL/файлов/сети/вычисления. Hash string syntax не проверка содержимого;
adapter reference не загрузка кода и не доказательство совместимости.

|Поле|Контракт|
|---|---|
|schema_version|Ровно1.0; несовместимые схемы не угадываются|
|method_id|ASCII lowercase identifier<=96, не путь/имя функции|
|package_version|Exact numeric SemVer x.y.z, без ведущих нулей/prerelease/build, <=32|
|title/language|Plain metadata<=200 и ограниченный language tag; не HTML|
|provenance|origin existing_processor/owner_materials/new_sources; <=50 unique sourceIDs/citations/HTTPS bibliographic URLs ornull; отдельные missing flags|
|rights|unknown/no sources либо evidence_supplied/nonempty source refs; не approved|
|instruction|artifact ID либо явноnull; missing не восполняется текстом|
|form|artifact ID и отдельная exactversion либо обаnull|
|items|<=500 uniqueIDs, ordinal1..N, single_choice(2..20 uniquevalue/label options), integer или finite number(min<=max); текст вопросов во внешнем data artifact|
|scales|<=100 uniqueIDs/labels, finite bounds orbothnull, direction explicit higher/lower/not_specified|
|calculation|kind sum/reverse_sum/forced_choice/profile/special, adapterID+exactversion orbothnull, specification/key artifact refs ornull|
|norms|absent =no table/applicability/sources; evidence_supplied требует все три; не научное утверждение|
|control_vectors|<=20 unique synthetic-only vectors; complete ordered item IDs/answer types/scale IDs/ranges; independent orlegacy_regression source basis|
|artifacts|<=32 uniqueID/path, relative json/md/txt only, bytes1..1048576 each/total<=8388608, lowercaseSHA25664, matching data media type|
|review|Только technical:unverified/scientific:draft/publication:draft; import не повышает статусы|

Все object keys exact whitelist; undefined/object/array/string-number coercion
не применяется. Nullable отсутствие отделено от нулевого ответа/балла. Package,
form и handler version закреплены отдельно; metadata не нормализует тексты,
порядок arrays, версии или ключи. URL — ссылка на источник, **не разрешение fetch**:
извлечение источников/SSRF policy отдельный будущий workflow.

Data paths не принимают absolute/drive/backslash/dot segments/encodedseparators/
query/fragment/URLs/scripts/archives. Этот блок не распаковывает архив и не читает
диск; безопасная работа с actual artifacts/symlinks/bytes/hash будет отдельным
trusted adapter, а обработчик — static allowlist, не импортированный JS/eval.

## Независимые проверки

Явные missing flags сохраняются, вычисляются отсутствующие структурные части;
always blockers: artifacts_not_verified, handler_not_verified,
scientific_review_required, publication_not_authorized. Rights unknown также
blocker; forced_choice с отсутствующим ключом отмечается как missingkey.
Необязательные неподтверждённые нормы не подменяются стандартными/придуманными.

Control vector syntax/range/source checks НЕ доказывают независимость источника
и НЕ выполняют расчёт. Даже неверный арифметически expected внутри допустимого
диапазона может структурно пройти: ожидаемый результат требует сравнения с
trusted handler и independently checked vector в следующем блоке. Успех кодового
теста, frozen object и заявленная independent basis не scientific approval.

Синтетические descriptors показывают поддержку sums/reverse/choices/profile/
special/continuous formats; это не перенос реальной методики и не восполнение
отсутствующего бланка. TKI unchanged; legacy ошибочный ключ не возвращается.
Новый validator не подключён к HTTP/UI/БД/production.
