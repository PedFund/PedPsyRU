# Шкала оценки жизнеспособности семьи FRAS – ключ обработки

```yaml
id: fras_ru_34_gusarova_2021
name: "Шкала оценки жизнеспособности семьи"
original_name: "Family Resilience Assessment Scale (FRAS)"
version: "Российская адаптация, 34 диагностических пункта"
adaptation: "Е. С. Гусарова, М. А. Одинцова, М. Г. Сорокова, 2021"
items: 34

response:
  type: ordinal
  valid: [1, 2, 3, 4]
  labels:
    1: "Полностью не согласен"
    2: "Не согласен"
    3: "Согласен"
    4: "Полностью согласен"

missing:
  rule: not_specified_in_primary_source

reverse:
  items: []

scales:
  family_communication_connectedness:
    name_ru: "Семейная коммуникация и связность"
    direct: [3, 6, 8, 9, 10, 11, 16, 18, 20, 21, 22, 23, 30, 31, 32]
  positive_outlook_problem_solving:
    name_ru: "Позитивный прогноз и решение проблем"
    direct: [14, 15, 17, 19, 26, 27, 33, 34]
  acceptance_flexibility:
    name_ru: "Принятие и гибкость"
    direct: [1, 4, 5, 7, 13]
  social_resources:
    name_ru: "Социальные ресурсы"
    direct: [2, 12, 24, 25, 28, 29]

formula: "raw_scale = sum(item responses)"

derived:
  family_resilience_total:
    name_ru: "Жизнеспособность семьи"
    formula: "family_communication_connectedness + positive_outlook_problem_solving + acceptance_flexibility + social_resources"

ranges:
  family_communication_connectedness: [15, 60]
  positive_outlook_problem_solving: [8, 32]
  acceptance_flexibility: [5, 20]
  social_resources: [6, 24]
  family_resilience_total: [34, 136]

stanines:
  family_communication_connectedness:
    - [15, 32, 1]
    - [33, 36, 2]
    - [37, 40, 3]
    - [41, 44, 4]
    - [45, 46, 5]
    - [47, 52, 6]
    - [53, 56, 7]
    - [57, 58, 8]
    - [59, 60, 9]
  positive_outlook_problem_solving:
    - [8, 17, 1]
    - [18, 20, 2]
    - [21, 22, 3]
    - [23, 23, 4]
    - [24, 24, 5]
    - [25, 27, 6]
    - [28, 30, 7]
    - [31, 31, 8]
    - [32, 32, 9]
  acceptance_flexibility:
    - [5, 11, 1]
    - [12, 13, 2]
    - [14, 14, 3]
    - [15, 15, 4]
    - [16, 16, 5]
    - [17, 17, 6]
    - [18, 19, 7]
    - [20, 20, 8]
    - [20, 20, 9]
  social_resources:
    - [6, 11, 1]
    - [12, 13, 2]
    - [14, 15, 3]
    - [16, 17, 4]
    - [18, 18, 5]
    - [19, 20, 6]
    - [21, 22, 7]
    - [23, 24, 8]
    - [24, 24, 9]
  family_resilience_total:
    - [34, 77, 1]
    - [78, 85, 2]
    - [86, 93, 3]
    - [94, 99, 4]
    - [100, 105, 5]
    - [106, 115, 6]
    - [116, 122, 7]
    - [123, 127, 8]
    - [128, 136, 9]

stanine_levels:
  1: very_low
  2: below_average
  3: below_average
  4: average
  5: average
  6: average
  7: above_average
  8: above_average
  9: very_high

stanine_status: "needs_verification_for_published_ceiling_overlap_in_F3_and_F4"

direction:
  family_communication_connectedness: higher_is_better
  positive_outlook_problem_solving: higher_is_better
  acceptance_flexibility: higher_is_better
  social_resources: higher_is_better
  family_resilience_total: higher_is_better

version_match:
  status: exact
  evidence: "Excel Танит содержит 34 диагностических пункта в том же порядке и с теми же формулировками; фактические ответы кодируются значениями 1–4."

quality_status: B_READY_WITH_LIMITATIONS
scoring_ready: true
```

Алгоритм: все 34 пункта прямые. Сначала суммируются четыре субшкалы, затем их суммы образуют общий показатель жизнеспособности семьи. Для расчета сырых шкал и общего показателя ключ полностью исполняемый.

Критическое ограничение: в опубликованной нормативной таблице российской адаптации максимальное сырое значение `20` для шкалы «Принятие и гибкость» одновременно указано для 8-го и 9-го станайна, а значение `24` для «Социальных ресурсов» – одновременно для 8-го и 9-го станайна. Это сохранено в файле как конфликт первоисточника и не исправляется предположением. До отдельной верификации автоматический перевод этих двух потолочных значений в станайны следует считать неоднозначным. Сырые баллы при этом рассчитываются однозначно.

## Источники

1. Гусарова Е. С., Одинцова М. А., Сорокова М. Г. (2021). Шкала оценки жизнеспособности семьи: адаптация на российской выборке. Психологические исследования, 14(77). DOI: 10.54359/ps.v14i77.130. https://psystudy.ru/num/article/view/130
2. Sixbey M. T. (2005). Development of the Family Resilience Assessment Scale to identify family resilience constructs. University of Florida.

## Направление показателей

Все четыре субшкалы и общий показатель: **чем выше, тем выше выраженность семейной жизнеспособности**. В исследовательской аналитике рост трактуется как благоприятная динамика.
