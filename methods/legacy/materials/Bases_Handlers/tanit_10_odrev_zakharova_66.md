# ОДРЭВ Е. И. Захаровой, 66 пунктов – ключ обработки

```yaml
id: odrev_zakharova_66
name: "Опросник детско-родительского эмоционального взаимодействия"
alias: "Опросник эмоциональных отношений в семье"
author: "Е. И. Захарова"
year: 1997
items: 66

response:
  type: likert_agreement
  excel_valid: [1, 2, 3, 4, 5]
  excel_labels:
    1: "Абсолютно верно"
    2: "Скорее всего это так"
    3: "В некоторых случаях верно"
    4: "Не совсем верно"
    5: "Абсолютно неверно"
  published_scoring_orientation:
    5: "Абсолютно верно"
    4: "Скорее всего это так"
    3: "В некоторых случаях верно"
    2: "Не совсем верно"
    1: "Абсолютно неверно"

preprocess:
  excel_to_published_score: "x = 6 - excel_value"

missing:
  rule: not_specified

scales:
  perception_of_child_state:
    positive: [1, 23, 45]
    negative: [12, 34, 56]
  understanding_causes_of_state:
    positive: [13, 35, 57]
    negative: [2, 24, 46]
  empathy:
    positive: [3, 25, 47]
    negative: [14, 36, 58]
  parental_feelings_in_interaction:
    positive: [15, 37, 59]
    negative: [4, 26, 48]
  unconditional_acceptance:
    positive: [5, 27, 49]
    negative: [16, 38, 60]
  self_acceptance_as_parent:
    positive: [17, 39, 61]
    negative: [6, 28, 50]
  predominant_emotional_background:
    positive: [7, 29, 51]
    negative: [18, 40, 62]
  physical_contact:
    positive: [19, 41, 63]
    negative: [8, 30, 52]
  emotional_support:
    positive: [9, 31, 53]
    negative: [20, 42, 64]
  orientation_to_child_state:
    positive: [21, 43, 65]
    negative: [10, 32, 54]
  influence_on_child_state:
    positive: [11, 33, 55]
    negative: [22, 44, 66]

formula:
  each_scale: "(a + b + c - d - e - f + 13) / 5"
  note: "a,b,c are published-orientation scores for positive items; d,e,f are published-orientation scores for negative items"

mathematical_range_from_formula: [0.2, 5.0]
published_range_note: "some reproductions state 0.5–5.0, which is arithmetically inconsistent with the printed formula and 1–5 item scores"

criterion_N:
  perception_of_child_state: 3.7
  understanding_causes_of_state: 3.2
  empathy: 2.8
  parental_feelings_in_interaction: 3.3
  unconditional_acceptance: 3.2
  self_acceptance_as_parent: 3.1
  predominant_emotional_background: 3.0
  physical_contact: 3.3
  emotional_support: 2.8
  orientation_to_child_state: 2.3
  influence_on_child_state: 3.2

criterion_rule: "score < N indicates a deficit of the corresponding characteristic"

derived_blocks:
  sensitivity:
    components: [perception_of_child_state, understanding_causes_of_state, empathy]
    aggregate_formula: null
  emotional_acceptance:
    components: [parental_feelings_in_interaction, unconditional_acceptance, self_acceptance_as_parent, predominant_emotional_background]
    aggregate_formula: null
  behavioral_manifestations:
    components: [physical_contact, emotional_support, orientation_to_child_state, influence_on_child_state]
    aggregate_formula: null

cutoffs:
  type: criterion_N_by_scale
  universal_low_medium_high: null

direction:
  all_11_scales: higher_is_better

version_match:
  status: exact_with_response_recode
  evidence: "Excel Танит contains exactly 66 diagnostic items in the published order. The answer labels are the same five verbal categories but numerically encoded in the opposite direction, so preprocessing x=6−excel_value is mandatory."

quality_status: B_READY_WITH_LIMITATIONS
scoring_ready: true
```

## Алгоритм

Критическая особенность формы Танит: числовая кодировка ответа противоположна опубликованной шкале ОДРЭВ. В форме Танит `1 = Абсолютно верно`, `5 = Абсолютно неверно`; в опубликованном бланке для расчета `5 = Абсолютно верно`, `1 = Абсолютно неверно`. Поэтому **до расчета всех шкал каждый ответ необходимо перекодировать по формуле `x = 6 - x_excel`**.

После перекодировки для каждой из 11 характеристик берутся три положительных и три отрицательных утверждения и применяется авторская формула:

`(a + b + c - d - e - f + 13) / 5`.

Общий суммарный показатель ОДРЭВ не найден в авторской схеме и не рассчитывается. Три содержательных блока являются группировкой 11 параметров; отдельная подтвержденная формула агрегирования блока не обнаружена, поэтому среднее/сумма блока автоматически не создаются.

## Проверка диапазона

При ответах 1–5 и напечатанной формуле математически возможен диапазон `0.2–5.0`. В ряде методических воспроизведений рядом с этой же формулой указан диапазон `0.5–5.0`. Эти два утверждения несовместимы. Для обработчика используется сама опубликованная формула без искусственного изменения константы или знаменателя; расхождение диапазона фиксируется как документированное ограничение.

## Критериальные значения

Для выборки 104 матерей дошкольников опубликованы критериальные значения N. Если индивидуальный показатель ниже N, авторская интерпретация допускает вывод о дефиците соответствующей характеристики. Эти N являются шкалоспецифичными и не заменяются универсальными уровнями «низкий/средний/высокий».

## Источники

1. Захарова Е. И. Опросник для исследования эмоциональной стороны детско-родительского взаимодействия // Семейная психология и семейная терапия. 1997. № 1.
2. Современные воспроизведения методики, содержащие 66 пунктов, 11 шкал, формулу обработки и таблицу M/N; ключ сопоставлен между несколькими источниками.

## Направление показателей

Все 11 характеристик: **чем выше, тем более выражена соответствующая благоприятная характеристика эмоционального взаимодействия**. Значение ниже опубликованного N трактуется как дефицит характеристики.
