# ЦО-36 В. Н. Куницыной – родители – исполняемый ключ

```yaml
id: co36_kunitsyna_36
name: "Методика изучения семейных ценностей ЦО-36"
author: "В. Н. Куницына"
year: 2005
items: 36
form_context: "родители"
excel_file: "2026-09-02 Методика изучения семейных ценностей ЦО-36 для родителей.xlsx"

response:
  type: constrained_priority_rating
  valid: [1,2,3,4,5,6,7,8,9,10,11,12]
  instruction_constraints:
    score_12_count: 1
    score_11_count: 2
    score_10_count: 3
    score_1_count: 1
    note: "оценки 2–9 распределяются между оставшимися ценностями; это не уникальное ранжирование 1–36"

reverse:
  items: []

scales:
  family_safety:
    label: "Безопасность"
    items: [1, 7, 13]
    formula: mean
    range: [1, 12]

  family_traditions:
    label: "Традиции"
    items: [4, 10, 16]
    formula: mean
    range: [1, 12]

  family_interpersonal_relations:
    label: "Межличностные отношения"
    items: [6, 12, 18]
    formula: mean
    range: [1, 12]

  family_normative_conformity:
    label: "Нормативное и конформное поведение"
    items: [21, 27, 33]
    formula: mean
    range: [1, 12]

  individual_achievement:
    label: "Достижение"
    items: [2, 8, 14]
    formula: mean
    range: [1, 12]

  individual_power_influence:
    label: "Власть и влияние"
    items: [20, 26, 32]
    formula: mean
    range: [1, 12]

  individual_hedonism:
    label: "Гедонизм"
    items: [19, 25, 31]
    formula: mean
    range: [1, 12]

  individual_activity_stimulation:
    label: "Активность и стимулирование"
    items: [22, 28, 34]
    formula: mean
    range: [1, 12]

  universal_independence:
    label: "Независимость"
    items: [3, 9, 15]
    formula: mean
    range: [1, 12]

  universal_moral_orientation:
    label: "Нравственная направленность"
    items: [5, 29, 35]
    formula: mean
    range: [1, 12]

  universal_tolerance:
    label: "Толерантность"
    items: [24, 30, 36]
    formula: mean
    range: [1, 12]

  universal_spiritual:
    label: "Духовные ценности"
    items: [11, 17, 23]
    formula: mean
    range: [1, 12]

derived:
  family_values:
    formula: "mean(family_safety, family_traditions, family_interpersonal_relations, family_normative_conformity)"
    range: [1, 12]
  individual_values:
    formula: "mean(individual_achievement, individual_power_influence, individual_hedonism, individual_activity_stimulation)"
    range: [1, 12]
  universal_moral_values:
    formula: "mean(universal_independence, universal_moral_orientation, universal_tolerance, universal_spiritual)"
    range: [1, 12]

total_score: null
missing:
  rule: not_specified

direction:
  all_scales: "higher = greater subjective importance; no better/worse interpretation"

scoring_ready: true
quality_status: A_READY
```

## Контроль структуры

Все 36 ценностей покрыты ключом ровно один раз: 12 блоков × 3 пункта. Блоки объединяются в три группы: семейные, индивидуальные, общечеловеческие и нравственные ценности.

Индексы восстановлены из опубликованного порядка 36 ценностей и содержательного описания всех 12 авторских блоков. Например, блок «Достижение» включает «Достижение успеха» (2), «Интеллект» (8), «Честолюбие» (14); «Власть и влияние» – «Социальное признание» (20), «Благосостояние» (26), «Авторитетность» (32); «Духовные» – «Мир прекрасного» (11), «Мудрость» (17), «Смысл жизни» (23).

Для блоков используется среднее трех оценок. Именно средние баллы блоков используются в опубликованных исследованиях ЦО-36, что сохраняет исходную метрику 1–12.

## Источники

1. Куницына В. Н. Методы изучения семейных ценностей и взаимодействия внутри семьи (ЦО-36, ПиН) // Семья в современном мире. СПб.: СПбГУ, 2010.
2. Публичный бланк и инструкция: https://psytests.org/life/co36-run.html
3. Описание полного состава 12 блоков: https://studwood.net/920698/psihologiya/tsennostno_smyslovaya_sfera_lichnosti_chitatelya
4. Подтверждение использования средних баллов по блокам: https://infourok.ru/nravstvennie-cennosti-v-strukture-cennostnogo-soznaniya-sovremennih-studentov-2280788.html

## Направление показателей

Чем выше балл, тем выше субъективная значимость ценности/блока. Нормативной интерпретации «низкий–средний–высокий» без отдельной нормативной выборки не вводить.
