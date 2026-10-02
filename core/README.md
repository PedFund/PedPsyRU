# Пилот вычислительного контракта: Томас—Килманн

Адаптер `tki-contract.js` вызывает существующую `scoreComplete` и фиксирует snapshot ключа SHA-256. Это черновой вызов для проверки переноса. Обработчик legacy не изменен.

```js
const {scoreTki, CONTRACT_VERSION, METHOD_VERSION_ID, HANDLER_VERSION} = require("./core/tki-contract.js");
const result = scoreTki({
  contract_version: CONTRACT_VERSION,
  method_version_id: METHOD_VERSION_ID,
  handler_version: HANDLER_VERSION,
  responses: Array.from({length: 30}, (_, index) => ({
    item_id: "q" + String(index + 1).padStart(2, "0"),
    value: "B"
  }))
});
```

Ожидаемый результат: пять сырых баллов по 6, `status: "scored"`, `validation_state: "requires_source_verification"`, `usable_for_aggregation: false`, предупреждение `KEY_SOURCE_CONFLICT`. `scored` означает только успешное вычисление. Причина ограничения: расхождение 21A с указанной научной публикацией; см. `METHOD_VALIDATION.md`.

Вход: обязательные версии контракта/методики/адаптера и 30 уникальных ответов q01–q30 со значениями строго A/B. Порядок массива свободный. Числовые, кириллические и текстовые ответы требуют отдельного импортного адаптера. Дубликаты, неизвестные пункты и недопустимые значения отклоняются; пропуски дают `incomplete` без баллов.

Выход: версии, статус, состояние проверки, качество, `measures[]` со стабильными кодами и русскими названиями, пустые `classifications[]`, предупреждения с кодами и digest ключа. Нормы и уровни не добавляются. Вызов детерминирован, вход не изменяется. Время расчета, идентификаторы исследования и участника должен записывать вызывающий сервис.

Неизвестная версия или изменение ключа блокирует вычисление. Версии: `1.0`, `tki_ru_30_pairs@legacy-5.5.8-draft`, `tki-contract-0.1.0`. Исполняемые проверки контракта находятся в `tests/tki-contract.test.js`; универсальная JSON Schema для всех методик пока не утверждена.

Запуск проверок вычислителя: `npm run test:tki`. Проверки бланка: `npm run test:form`. Все проверки пилота в новом репозитории: `npm test`. Это отдельный набор; прежний большой `tests.js` с XLSX-выгрузками в этот пилот не перенесен.
