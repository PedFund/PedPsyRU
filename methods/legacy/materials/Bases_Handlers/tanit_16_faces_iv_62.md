# FACES IV Package, 62 пункта – ключ обработки

```yaml
id: faces_iv_62
name: "Шкала семейной сплоченности и гибкости FACES IV"
original_name: "FACES IV Package"
authors: ["David H. Olson", "Dean M. Gorall"]
items: 62

excel_match:
  file: "2026-09-02 Шкала семейной сплоченности и гибкости FACES IV для семей бе.xlsx"
  diagnostic_columns: 62
  excel_question_columns: [10, 71]
  core_items: [1, 42]
  communication_items: [43, 52]
  satisfaction_items: [53, 62]
  response_values_observed: [1, 2, 3, 4, 5]
  item_order_match: exact
  version_match: exact

response:
  type: likert
  valid: [1, 2, 3, 4, 5]
  core_labels:
    1: "абсолютно не согласен"
    2: "скорее не согласен"
    3: "не уверен"
    4: "скорее согласен"
    5: "полностью согласен"
  satisfaction_labels:
    1: "очень недоволен"
    2: "скорее недоволен"
    3: "в целом доволен"
    4: "очень доволен"
    5: "абсолютно доволен"

missing:
  rule: not_specified

reverse:
  items: []

scales:
  balanced_cohesion:
    direct: [1, 7, 13, 19, 25, 31, 37]
    formula: sum
    range: [7, 35]

  balanced_flexibility:
    direct: [2, 8, 14, 20, 26, 32, 38]
    formula: sum
    range: [7, 35]

  disengaged:
    direct: [3, 9, 15, 21, 27, 33, 39]
    formula: sum
    range: [7, 35]

  enmeshed:
    direct: [4, 10, 16, 22, 28, 34, 40]
    formula: sum
    range: [7, 35]

  rigid:
    direct: [5, 11, 17, 23, 29, 35, 41]
    formula: sum
    range: [7, 35]

  chaotic:
    direct: [6, 12, 18, 24, 30, 36, 42]
    formula: sum
    range: [7, 35]

  family_communication:
    direct: [43, 44, 45, 46, 47, 48, 49, 50, 51, 52]
    formula: sum
    range: [10, 50]

  family_satisfaction:
    direct: [53, 54, 55, 56, 57, 58, 59, 60, 61, 62]
    formula: sum
    range: [10, 50]

derived:
  cohesion_ratio: "balanced_cohesion / ((disengaged + enmeshed) / 2)"
  flexibility_ratio: "balanced_flexibility / ((rigid + chaotic) / 2)"
  total_circumplex_ratio: "(cohesion_ratio + flexibility_ratio) / 2"

derived_ranges:
  cohesion_ratio: [0.2, 5.0]
  flexibility_ratio: [0.2, 5.0]
  total_circumplex_ratio: [0.2, 5.0]

ratio_interpretation:
  balanced_threshold: 1.0
  above_1: "more balanced than unbalanced characteristics"
  below_1: "more unbalanced than balanced characteristics"

percentile_conversion:
  available_in_manual: true
  implemented: false
  reason: "официальная percentile conversion chart не найдена в открытом проверяемом источнике"

direction:
  balanced_cohesion: higher_is_better
  balanced_flexibility: higher_is_better
  disengaged: higher_is_worse
  enmeshed: higher_is_worse
  rigid: higher_is_worse
  chaotic: higher_is_worse
  family_communication: higher_is_better
  family_satisfaction: higher_is_better
  cohesion_ratio: higher_is_better
  flexibility_ratio: higher_is_better
  total_circumplex_ratio: higher_is_better

scoring_ready: true
quality_status: B_READY_WITH_LIMITATIONS
```

Критические особенности обработки:

- Excel Танит представляет **полный 62-пунктовый FACES IV Package**: 42 основных пункта + 10 пунктов Family Communication + 10 пунктов Family Satisfaction.
- Первые 42 пункта распределяются по шести шкалам строго циклически по номеру пункта; каждая шкала содержит 7 пунктов.
- Реверсивных пунктов в опубликованном scoring key нет.
- Основные сырые шкалы рассчитываются суммированием.
- Три ratio-показателя рассчитываются из шести основных шкал. Значение `1` означает равный объем balanced и unbalanced характеристик; значения выше 1 указывают на преобладание balanced характеристик.
- Не применять к этой методике ключ FACES III.
- В руководстве предусмотрен перевод сырых шкальных показателей в процентили. Проверяемой открытой полной таблицы преобразования в текущем поиске нет, поэтому она **не реконструируется** и в обработчик пока не зашивается.
- Сырые шкалы и ratio-показатели при этом рассчитываются полностью и воспроизводимо.

## Источники

1. Olson D.H. FACES IV and the Circumplex Model: Validation Study. Journal of Marital & Family Therapy. 2011;37(1):64–80. DOI: 10.1111/j.1752-0606.2009.00175.x  
   https://onlinelibrary.wiley.com/doi/10.1111/j.1752-0606.2009.00175.x

2. PubMed – описание валидизационного исследования FACES IV.  
   https://pubmed.ncbi.nlm.nih.gov/21198689/

3. Psychometric properties of the FACES IV package for Spanish adolescents – открытая статья, содержащая распределение item numbers по шести шкалам.  
   https://pmc.ncbi.nlm.nih.gov/articles/PMC9209570/

4. Contemporary empirical description of FACES IV ratio scoring.  
   https://link.springer.com/article/10.1186/s13023-025-03636-0

## Направление показателей

- Balanced Cohesion, Balanced Flexibility, Communication, Satisfaction и ratio-показатели: **чем выше, тем благоприятнее**.
- Disengaged, Enmeshed, Rigid, Chaotic: **чем выше, тем проблемнее функционирование**.
