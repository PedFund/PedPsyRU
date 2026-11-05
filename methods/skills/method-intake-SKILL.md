---
name: method-intake
description: Turn a raw psychodiagnostic method package (JSON, PDF text or archive) into a platform-ready release — normalised package, scoring key, pinned migrations and tests. Use whenever a new method must be connected to PedPsyRU, or an existing package must be checked before release.
---

# Подключение методики в PedPsyRU

Skill описывает полный цикл: проверка сырого пакета → нормализация → ключ → выпуск → миграции → приёмка → PR.
Код живёт в репозитории, skill задаёт порядок и границы.

## Шаг 0. Сначала проверьте репозиторий

Прежде чем сказать «данных нет», проверьте три места:

1. `methods/approved/v1/<NN>_*.json` — пакет владельца: тексты пунктов, варианты ответа, списки шкал, формулы;
2. `methods/legacy/library.json` — архивные описания и русские названия показателей;
3. `methods/legacy/materials/` — бланки, ключи, паспорта.

Отсутствие записи в `scoring-contracts.json` **не означает** отсутствие данных.

## Шаг 1. Проверить пакет (обязательно, до любых правок)

Запустите проверку в режиме отчёта, не меняя файлы:

```
node scripts/method-intake.js --check methods/approved/v1/<файл>.json
```

Проверяется:

| Правило | Что означает |
|---|---|
| идентификаторы пунктов | `q01…qNN` без пропусков и дублей |
| версия | plain semver, например `1.0.0-staging` |
| варианты ответа | `response_options` с подписями **или** `scoring.response.valid` (ранжирование) |
| покрытие шкал | каждый пункт входит ровно в одну шкалу |
| квоты | если `constrained_priority_rating`, квота должна попасть в ключ |
| инструкция | отсутствие — блокер, а не повод придумать текст |
| права | не заявлены → выпуск остаётся учебным `draft` |

## Шаг 2. Нормализовать только механическое

Разрешено без методологического решения:

- `Q01 → q01`;
- `"84 пункта" → 1.0.0-staging`;
- `text_male → text`, если владелец сказал, что половая форма не нужна;
- числовые `valid` сравнивать со строками (движок принимает строки).

Запрещено: придумывать тексты, якоря ответов, нормы, инструкции, права.

## Шаг 3. Собрать артефакты

```
node scripts/build-approved-v1-keys.js
node scripts/build-approved-v1-packages.js
node scripts/generate-approved-v1-delta.js <base> <base> <NNN>_<method>.sql
node scripts/generate-approved-v1-results.js <NNN>_results.sql
node scripts/generate-approved-v1-attempt-guard.js <NNN>_guard.sql
```

Номера миграций — только следующая свободная, append-only. Существующие не редактируются.

## Шаг 4. Приёмка

```
npm run build && npm test
node --test tests/postgres-approved-v1-online.integration.js
```

Плюс на стенде: применить миграции, импортировать выпуск, пройти путь участника до результата.
Контрольный вектор должен воспроизводиться ключом; для ранжирования — уважать квоту.

## Шаг 5. Оформить

1. обновить живые документы: `methods/README.md`, `CURRENT_STATE.md`;
2. commit → push → PR → CI;
3. merge только после зелёного CI на точном SHA и с согласия владельца.

## Чего не делать

- не менять закреплённые выпуски, формы, digest'ы и историю результатов;
- не строить половую форму без прямого решения владельца;
- не ослаблять тесты и не повышать таймауты вместо поиска причины;
- не выдавать учебный `draft` за научно утверждённую методику.
