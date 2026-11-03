# Пятифакторный опросник осознанности FFMQ-39 – ключ обработки

```yaml
id: ffmq_39_yumartova_grishina
name: "Пятифакторный опросник осознанности"
original_name: "Five Facet Mindfulness Questionnaire (FFMQ)"
version: "FFMQ-39"
authors: "R. A. Baer, G. T. Smith, J. Hopkins, J. Krietemeyer, L. Toney, 2006"
adaptation: "Н. М. Юмартова, Н. В. Гришина"
items: 39

response:
  type: ordinal_likert
  valid: [1, 2, 3, 4, 5]
  anchors:
    1: "никогда или очень редко"
    5: "очень часто или всегда"

missing:
  rule: not_specified_in_sources_used_for_key

reverse:
  formula: "6 - x"
  items: [3, 5, 8, 10, 12, 13, 14, 16, 17, 18, 22, 23, 25, 28, 30, 34, 35, 38, 39]

scales:
  observing:
    name_ru: "Наблюдение"
    direct: [1, 6, 11, 15, 20, 26, 31, 36]
    reverse: []
  describing:
    name_ru: "Описание"
    direct: [2, 7, 27, 32, 37]
    reverse: [12, 16, 22]
  acting_with_awareness:
    name_ru: "Осознанность действий"
    direct: []
    reverse: [5, 8, 13, 18, 23, 28, 34, 38]
  nonjudging:
    name_ru: "Безоценочность"
    direct: []
    reverse: [3, 10, 14, 17, 25, 30, 35, 39]
  nonreactivity:
    name_ru: "Нереагирование"
    direct: [4, 9, 19, 21, 24, 29, 33]
    reverse: []

formula: "raw_scale = sum(recode_as_needed(item responses))"

ranges:
  observing: [8, 40]
  describing: [8, 40]
  acting_with_awareness: [8, 40]
  nonjudging: [8, 40]
  nonreactivity: [7, 35]

cutoffs: null

derived:
  total_score: null

notes_on_total: "Каноническая обработка для данного файла использует пять отдельных фасет. Общий суммарный показатель не рассчитывать без отдельного явно выбранного исследовательского протокола."

direction:
  observing: higher_is_more_trait
  describing: higher_is_more_trait
  acting_with_awareness: higher_is_more_trait
  nonjudging: higher_is_more_trait
  nonreactivity: higher_is_more_trait

version_match:
  status: exact
  evidence: "Оба Excel-файла Танит (для родителей и семей без детей) содержат по 39 диагностических пунктов; порядок и формулировки соответствуют FFMQ-39, ответы хранятся как 1–5."

applies_to_forms:
  - "FFMQ для родителей"
  - "FFMQ для семей без детей"

quality_status: A_READY
scoring_ready: true
```

Алгоритм: реверсировать 19 указанных пунктов по формуле `6 - x`, затем отдельно суммировать пять фасет. Четыре шкалы имеют по 8 пунктов, «Нереагирование» – 7 пунктов. Универсальных клинических или нормативных порогов для низкого/среднего/высокого уровня в ключ не вводить.

## Источники

1. Baer R. A., Smith G. T., Hopkins J., Krietemeyer J., Toney L. (2006). Using self-report assessment methods to explore facets of mindfulness. Assessment, 13(1), 27–45. DOI: 10.1177/1073191105283504.
2. Carpenter J. K. et al. (2019). Item Response Theory Analysis of the Five Facet Mindfulness Questionnaire and its Short Forms. Psychological Assessment. https://pmc.ncbi.nlm.nih.gov/articles/PMC6823990/
3. Юмартова Н. М., Гришина Н. В. (2016). Осознанность (Mindfulness): психологические характеристики и адаптация инструментов измерения. Психологический журнал, 37(4), 105–115.
4. Русскоязычный ключ с совпадающей нумерацией: https://dip-psi.ru/psikhologicheskiye-testy/post/pyatifaktornyj-oprosnik-osoznannosti-pfoo-adaptaciya-n-m-yumartovoj-n-v-grishinoj

## Направление показателей

Все пять фасет: более высокий балл означает большую выраженность соответствующего аспекта осознанности. Автоматически называть любой высокий балл «лучше» для всех исследовательских задач не следует; для анализа динамики осознанности рост обычно трактуется как увеличение измеряемого свойства.
