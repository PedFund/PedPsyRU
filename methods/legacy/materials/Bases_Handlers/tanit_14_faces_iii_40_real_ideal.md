# FACES III – ключ обработки формы REAL + IDEAL

```yaml
id: faces_iii_40_real_ideal
name: "Шкала семейной адаптации и сплоченности FACES III"
original_name: "Family Adaptability and Cohesion Evaluation Scales III"
authors: "David H. Olson, Joyce Portner, Yoav Lavee"
version: "20 REAL + repeated 20 IDEAL"
items: 40

response:
  type: likert_frequency
  valid: [1, 2, 3, 4, 5]

missing:
  rule: not_specified

scales:
  real_cohesion:
    direct: [1, 3, 5, 7, 9, 11, 13, 15, 17, 19]
  real_adaptability:
    direct: [2, 4, 6, 8, 10, 12, 14, 16, 18, 20]
  ideal_cohesion:
    direct: [21, 23, 25, 27, 29, 31, 33, 35, 37, 39]
  ideal_adaptability:
    direct: [22, 24, 26, 28, 30, 32, 34, 36, 38, 40]

reverse_items: []

formula:
  real_cohesion: "sum(items 1,3,...,19)"
  real_adaptability: "sum(items 2,4,...,20)"
  ideal_cohesion: "sum(items 21,23,...,39)"
  ideal_adaptability: "sum(items 22,24,...,40)"

derived:
  cohesion_discrepancy: "abs(real_cohesion - ideal_cohesion)"
  adaptability_discrepancy: "abs(real_adaptability - ideal_adaptability)"
  total_discrepancy: "cohesion_discrepancy + adaptability_discrepancy"

ranges:
  real_cohesion: [10, 50]
  real_adaptability: [10, 50]
  ideal_cohesion: [10, 50]
  ideal_adaptability: [10, 50]
  cohesion_discrepancy: [0, 40]
  adaptability_discrepancy: [0, 40]
  total_discrepancy: [0, 80]

cutoffs: null
levels: null

direction:
  real_cohesion: higher_is_more_cohesion
  real_adaptability: higher_is_more_adaptability
  ideal_cohesion: higher_is_more_desired_cohesion
  ideal_adaptability: higher_is_more_desired_adaptability
  cohesion_discrepancy: lower_is_greater_satisfaction
  adaptability_discrepancy: lower_is_greater_satisfaction
  total_discrepancy: lower_is_greater_satisfaction

version_match:
  status: exact
  evidence: "Excel Танит contains 40 diagnostic columns: items 1–20 describe the real family and items 21–40 repeat the same 20 content positions for the ideal family; response scale is 1–5."

quality_status: B_READY_WITH_LIMITATIONS
scoring_ready: true
```

## Алгоритм

1. Первые 20 пунктов являются FACES III REAL. Нечетные пункты суммируются в «Сплоченность», четные – в «Адаптивность/гибкость».
2. Пункты 21–40 являются теми же 20 содержательными позициями при инструкции об идеальной семье. Поэтому внутри этого блока снова используются нечетные и четные позиции относительно исходной двадцатки: 21,23,...,39 – идеальная сплоченность; 22,24,...,40 – идеальная адаптивность.
3. Реверсивных пунктов в используемой редакции нет.
4. Для каждого из четырех базовых показателей возможный диапазон 10–50.
5. Расхождение REAL–IDEAL хранить отдельно по сплоченности и адаптивности. Чем меньше абсолютное расхождение, тем выше согласованность реального и желаемого образа семьи.
6. `total_discrepancy` полезен как производный исследовательский индекс, но не должен подменять две исходные размерности.

## Ограничение по нормативной типологии

В руководствах и вторичных публикациях встречаются линейные категории FACES III и таблицы семейных типов, однако границы зависят от используемой нормативной схемы, стадии жизненного цикла и редакции scoring. Пока они намеренно не встроены как универсальные cut-off. Исполняемый расчет сырых REAL/IDEAL шкал от этого не зависит.

## Источники

1. Olson D. H., Portner J., Lavee Y. Family Adaptability and Cohesion Evaluation Scales III (FACES III), 20-item measure of cohesion and adaptability.
2. FACES III scoring materials: cohesion is the sum of the 10 odd items, adaptability is the sum of the 10 even items; items are scored 1–5.
3. Publications using separate REAL and IDEAL 20-item forms and interpreting the discrepancy as perceived family satisfaction.

## Направление показателей

- Сплоченность: рост означает большую выраженность семейной сплоченности, но сам по себе не должен автоматически трактоваться как «улучшение» без выбранной теоретической/нормативной модели.
- Адаптивность: рост означает большую выраженность адаптивности/гибкости; автоматическая оценка «лучше/хуже» без нормативной модели некорректна.
- REAL–IDEAL discrepancy: чем меньше, тем выше соответствие воспринимаемой семьи желаемой и тем выше косвенный показатель удовлетворенности.
