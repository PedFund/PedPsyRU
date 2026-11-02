# PRFQ-RU-16 – ключ обработки

```yaml
id: prfq_ru_16_kamskaya_2023
name: "Опросник «Родительское рефлексивное функционирование»"
original_name: "Parental Reflective Functioning Questionnaire (PRFQ)"
version: "русскоязычная 16-пунктовая адаптация, Камская и соавт., 2023"
items: 16

excel_match:
  file: "2026-09-02 Родительское рефлексивное функционирование PRFQ для родителе.xlsx"
  diagnostic_columns: 16
  excel_question_columns: [11, 26]
  response_values_observed: [1, 2, 3, 4, 5, 6, 7]
  item_text_match: exact
  version_match: exact

response:
  type: likert
  valid: [1, 2, 3, 4, 5, 6, 7]
  labels:
    1: "полностью не согласен"
    2: "не согласен"
    3: "скорее не согласен"
    4: "не определился"
    5: "скорее согласен"
    6: "согласен"
    7: "полностью согласен"

missing:
  rule: not_specified

reverse:
  items: [11]
  formula: "8 - x"

scales:
  prementalizing:
    label: "Предрефлексия (ПР)"
    direct: [1, 4, 7, 10, 13]
    reverse: []
    formula: "mean(items)"
    range: [1, 7]

  certainty:
    label: "Уверенность (Ув)"
    direct: [2, 5, 8, 14, 16]
    reverse: [11]
    formula: "mean(items after reverse scoring)"
    range: [1, 7]

  interest_curiosity:
    label: "Интерес и любопытство (ИЛ)"
    direct: [3, 6, 9, 12, 15]
    reverse: []
    formula: "mean(items)"
    range: [1, 7]

total_score: null

stanines:
  normative_sample_n: 205
  score_rounding_for_lookup: 2
  prementalizing:
    - {stanine: 1, min: 1.00, max: 1.00, level: low}
    - {stanine: 2, min: null, max: null, level: low, note: "в опубликованной таблице интервал отсутствует"}
    - {stanine: 3, min: 1.01, max: 1.20, level: low}
    - {stanine: 4, min: 1.21, max: 1.60, level: medium}
    - {stanine: 5, min: 1.61, max: 2.00, level: medium}
    - {stanine: 6, min: 2.01, max: 2.60, level: medium}
    - {stanine: 7, min: 2.61, max: 3.40, level: high}
    - {stanine: 8, min: 3.41, max: 4.40, level: high}
    - {stanine: 9, min: 4.41, max: 7.00, level: high}
  certainty:
    - {stanine: 1, min: 1.00, max: 2.17, level: low}
    - {stanine: 2, min: 2.18, max: 2.83, level: low}
    - {stanine: 3, min: 2.84, max: 3.50, level: low}
    - {stanine: 4, min: 3.51, max: 3.92, level: medium}
    - {stanine: 5, min: 3.93, max: 4.50, level: medium}
    - {stanine: 6, min: 4.51, max: 5.00, level: medium}
    - {stanine: 7, min: 5.01, max: 5.33, level: high}
    - {stanine: 8, min: 5.34, max: 5.83, level: high}
    - {stanine: 9, min: 5.84, max: 7.00, level: high}
  interest_curiosity:
    - {stanine: 1, min: 1.00, max: 3.60, level: low}
    - {stanine: 2, min: 3.61, max: 4.60, level: low}
    - {stanine: 3, min: 4.61, max: 5.20, level: low}
    - {stanine: 4, min: 5.21, max: 5.90, level: medium}
    - {stanine: 5, min: 5.91, max: 6.20, level: medium}
    - {stanine: 6, min: 6.21, max: 6.60, level: medium}
    - {stanine: 7, min: 6.61, max: 6.80, level: high}
    - {stanine: 8, min: 6.81, max: 6.99, level: high}
    - {stanine: 9, min: 7.00, max: 7.00, level: high}

direction:
  prementalizing: higher_is_worse
  certainty: context_dependent
  interest_curiosity: higher_is_better

cutoffs: null
scoring_ready: true
quality_status: A_READY
```

Критические особенности обработки:

- Excel Танит содержит **ровно 16 диагностических пунктов**, и их формулировки и порядок совпадают с приложением к российской адаптации 2023 года.
- Это не стандартная 18-пунктовая международная версия PRFQ. В российской адаптации после психометрической проверки были удалены два исходных пункта; в опубликованном приложении используется новая нумерация 1–16.
- Реверсируется только пункт 11: `x_rev = 8 - x`.
- Все три показатели рассчитываются как **среднее**, а не как сумма.
- Общий суммарный показатель PRFQ не рассчитывается.
- Оптимальное рефлексивное функционирование описывается сочетанием более низкой предрефлексии и средних/высоких значений интереса/любопытства и уверенности. Очень высокая уверенность сама по себе не должна механически трактоваться как «чем выше, тем лучше».
- В опубликованной таблице станайнов для ПР отсутствует интервал станайна 2; это сохранено как `null`, а не реконструировано.

## Источники

1. Камская А.О. и соавт. Опросник «Родительское рефлексивное функционирование»: адаптация на русскоязычной выборке. Современная зарубежная психология. 2023;12(3).  
   https://psyjournals.ru/journals/jmfp/archive/2023_n3/Kamskaya_et_al

2. UCL. The Parental Reflective Functioning Questionnaire (PRFQ) – официальная страница международной 18-item версии и scoring syntax. Используется для контроля происхождения методики, но не для подмены российской 16-item версии.  
   https://www.ucl.ac.uk/brain-sciences/parental-reflective-functioning-questionnaire-prfq

## Направление показателей

- Предрефлексия: **чем выше, тем хуже**.
- Интерес и любопытство: **чем выше, тем лучше** в рамках опубликованной интерпретации.
- Уверенность: **контекстно**; средние и высокие значения благоприятны, но чрезмерно высокая уверенность может отражать недостаточное признание непрозрачности психических состояний ребенка.
