# FAD-R, 53 пункта – исполняемый ключ для Excel Танит

```yaml
id: fad_r_53_sadovnikova
name: "Схема оценки семьи FAD"
original_name: "McMaster Family Assessment Device (FAD)"
authors: ["N. B. Epstein", "L. M. Baldwin", "D. S. Bishop"]
adaptation: "Т. Ю. Садовникова"
items: 53

excel_match:
  file: "2026-09-02 Схема оценки семьи FAD для семей без детей.xlsx"
  diagnostic_columns: 53
  excel_question_columns: [10, 62]
  response_values_observed: [1, 2, 3, 4]
  excel_labels:
    1: "совершенно не согласен"
    2: "скорее не согласен"
    3: "скорее согласен"
    4: "абсолютно согласен"
  item_text_match: exact_to_russian_53_form
  version_match: exact

response:
  type: likert
  valid: [1, 2, 3, 4]

scoring_direction:
  target: "higher = more dysfunctional family functioning"
  note: "Excel Танит кодирован противоположно классическому бланку FAD. Для позитивно сформулированных пунктов применяется 5-x; негативные пункты остаются как есть."

reverse:
  formula: "5 - x"
  items: [1, 2, 11, 13, 14, 18, 19, 20, 25, 29, 30, 31, 34, 35, 38, 41, 43, 47, 48, 50, 52, 53]

scales:
  problem_solving:
    label: "Решение проблем"
    items: [1, 13, 20, 31, 47]
    reverse: [1, 13, 20, 31, 47]
    formula: mean
    range: [1, 4]
    clinical_cutoff: 2.20

  communication:
    label: "Коммуникация"
    items: [2, 12, 14, 25, 33, 48]
    reverse: [2, 14, 25, 48]
    formula: mean
    range: [1, 4]
    clinical_cutoff: 2.20

  roles:
    label: "Роли"
    items: [3, 11, 15, 21, 26, 35, 39, 49]
    reverse: [11, 35]
    formula: mean
    range: [1, 4]
    clinical_cutoff: 2.30

  affective_responsiveness:
    label: "Аффективная реактивность"
    items: [4, 10, 16, 27, 41, 50]
    reverse: [41, 50]
    formula: mean
    range: [1, 4]
    clinical_cutoff: 2.20

  affective_involvement:
    label: "Аффективная вовлеченность"
    items: [5, 9, 17, 22, 28, 44, 51]
    reverse: []
    formula: mean
    range: [1, 4]
    clinical_cutoff: 2.10

  behavior_control:
    label: "Контроль поведения"
    items: [6, 8, 18, 23, 29, 37, 42, 45, 52]
    reverse: [18, 29, 52]
    formula: mean
    range: [1, 4]
    clinical_cutoff: 1.90

  general_functioning:
    label: "Общее функционирование"
    items: [7, 19, 24, 30, 32, 34, 36, 38, 40, 43, 46, 53]
    reverse: [19, 30, 34, 38, 43, 53]
    formula: mean
    range: [1, 4]
    clinical_cutoff: 2.00

missing:
  invalidate_scale_if_missing_fraction_gte: 0.40
  formula_when_valid: "mean(valid scored items)"

total_score: null

direction:
  problem_solving: higher_is_worse
  communication: higher_is_worse
  roles: higher_is_worse
  affective_responsiveness: higher_is_worse
  affective_involvement: higher_is_worse
  behavior_control: higher_is_worse
  general_functioning: higher_is_worse

scoring_ready: true
quality_status: A_READY
```

## Проверка с Excel Танит

Фактические 53 диагностические колонки Excel были сопоставлены с семью содержательными шкалами оригинального 53-пунктового FAD. Покрытие ключа: 53 из 53 пунктов, каждый пункт входит ровно в одну шкалу.

Размеры шкал совпадают с исходной публикацией Epstein et al. (1983): 5 + 6 + 8 + 6 + 7 + 9 + 12 = 53.

Критическое отличие Excel Танит: в нем 1 означает несогласие, а 4 – согласие. В классическом FAD исходная шкала обычно задается в противоположном направлении. Поэтому для позитивно сформулированных утверждений применяется `5-x`, а негативные остаются без преобразования. После этого по каждой шкале вычисляется среднее от 1 до 4, где более высокий балл означает большую дисфункциональность.

## Источники

1. Epstein N.B., Baldwin L.M., Bishop D.S. The McMaster Family Assessment Device. Journal of Marital and Family Therapy. 1983;9(2):171–180.  
   https://doi.org/10.1111/j.1752-0606.1983.tb01497.x

2. Открытая копия оригинальной статьи с таблицей 53 пунктов по семи субшкалам:  
   https://www.ntnu.no/c/document_library/get_file?groupId=10293&uuid=cd377890-a31d-4692-a9b8-47c563844862

3. Русский 53-пунктовый бланк и правило обработки пропусков:  
   https://archive-coursework.mmu.ru/files/upload/Diplomas/2025/publish/p_9891_343.pdf

4. Клинические cut-off Miller et al. для шкал FAD: 2.20 / 2.20 / 2.30 / 2.20 / 2.10 / 1.90 / 2.00.

## Направление показателей

Все семь шкал: **чем выше, тем хуже**. Значение выше соответствующего clinical cut-off указывает на проблемную область семейного функционирования.
