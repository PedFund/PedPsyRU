# Карпов: рефлексивность27 — материалы чернового импорта

## Полученные материалы и происхождение,2026-10-07

Владелец выбрал Карпова после TKI и предоставил27утверждений, семь подписей
ответов1..7 и ссылку на авторскую публикацию:
[Карпов,2003](https://psyjournras.ru/s0205-95920000621-0-1-ru-280).
Web tool при открытии вернул403; текст статьи/ключ/таблицы нормы не считаются
прочитанными или независимо подтверждёнными. Авторская полная инструкция не
предоставлена: короткое указание выбрать один ответ — отдельный technical draft.
Правомерность публичного распространения остаётся unknown, не следует из URL.

`methods/karpov/form.json`: source_text каждой строки и подписи сохраняет
предоставленное содержание; таблица№/колонки1..7 не превращена в лишние вопросы.
IDs q01–q27/number1..27, порядок и numeric answer codes1..7 закреплены.
Source statements SHA256(JSON.stringify(array)):
`68d6d3fb60df01637872322c192be6ecf1d960b97d1905bc75a79841fd5fb211`;
source labels:
`789a4dd73623e6338c7b909d14b969003064a496330cce1882e28b4f502d93b7`.

## Общий бланк через /

Только формы рода, относящиеся к отвечающему:

|Место|Display edit|
|---|---|
|Вопрос11|составил/составила|
|Вопрос26|виноватым/виноватой|
|Ответы1,2,3,5,6,7|согласен/согласна (исходный регистр первого слова сохранён)|

Вопрос19 «кто…виноват» — общий субъект, не грамматический род отвечающего;
не переписан. Остальные25вопросов display==source_text. Всего8displayedits,
не7: первоначальная устная предварительная оценка пропустила past verb вопроса11,
исправлена при пословной сверке **до** фиксации формы/тестов. Ни negation, ни
порядок, ни значения1..7 не изменены; answer4не становится missing/default4.

## Ключ и расчёт

`methods/karpov/keys/0.1.0-draft.json` копирует ровно расчетные поля unchanged
existing processor: id/items/type/valid/reverseMax/scales. Legacy builtin/processor
не редактируются. Norms/stenTable/словесныеlevels исключены из нового data key.
Технический fingerprint этих полей:
`4992123ed197210833bedd35974ef0eeb872d5f7307a5067288d99e7d6c632de`.
15direct+12reverse покрывают1..27без пересечений/дубликатов; reverseMax8.
Это точность переноса из кода, **не** независимое научное утверждение ключа.
Legacy ссылка [cpd-program.ru](https://cpd-program.ru/methods/rfk.htm) — вторичное
описание; не заменяет первичную публикацию/owner scientific review.

|Synthetic legacy regression|Expected raw|
|---|---|
|Все1|99|
|Все7|117|
|Все4|108|
|Направленные ответы для минимума|27|
|Направленные ответы для максимума|189|

Vectors помечены **legacy_regression**, не independent validation. Теоретический
rawrange27..189 — арифметика27вкладов1..7 по существующей формуле, не популяционные
нормы. Прежний processor может также выдавать стены/уровни; в новом пакете они
не утверждаются и не используются. Новый clinical scoring handler не реализован.

## Технические проверки и пределы

Шесть новых test groups: counts/IDs/source snapshot; строго8genderedits;
codes1..7/literal4; key fields/hash exactlylegacy/no norms; sets+5rawvectors;
generic package schema+actualartifactintegrity совместимость. Current generic
draft version0.1.0/form0.1.0-draft,4actualdataartifacts, source/rights/instruction/
handler/scientific/publication blockers остаются. `publishable:false`.
Private fixture читает только эти repo data artifacts, без Excel/PII/secrets.

Build/6groups/architecture locally passed; full338expected(332+6), current-head
all-six/actualunchanged294PG/threeChrome5/5/freshbase/preview/source/parents/full
manifests required beforeordinarymerge. Existing45critical untouched; только
два **новых** draft JSON вmethods/karpov увеличивают critical register до47.
Existing TKI/key/form/scoring/releases/SQL/packages/workflow/ownerstand/MFA не
меняются. Это подготовка материалов по новому вводу владельца, не закрытиефазы6.

После scientific/rights/source/instruction проверки возможен отдельный новый
approved release; сейчас нет регистрации clinicalrelease/доступа исследователю/
публичного запуска/согласованного нового нормативного толкования. Framework
06а.3проверка static handler/vectors и06бlibrary persistence продолжаются отдельно.
