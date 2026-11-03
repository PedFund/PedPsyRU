# Шкала здоровья семьи FHS-LF – ключ обработки

```yaml
id: fhs_lf_32_ru
name: "Шкала здоровья семьи"
original_name: "Family Health Scale – Long Form (FHS-LF)"
version: "32-item long form"
authors: "A. Crandall et al., 2020"
adaptation: "Е. В. Забелина, В. А. Максименко, А. М. Бушуева, 2024"
items: 32

response:
  type: ordinal_likert
  valid: [1, 2, 3, 4, 5]
  anchors:
    1: "strongly_disagree"
    5: "strongly_agree"

missing:
  rule: not_specified_for_individual_raw_scoring_in_sources_used

reverse:
  formula: "6 - x"
  items: [1, 5, 20, 21, 22, 23, 24, 29, 30, 31, 32]

scales:
  social_emotional_health_processes:
    name_ru: "Социально-эмоциональные процессы здоровья семьи"
    items: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 18, 19]
  healthy_lifestyle:
    name_ru: "Здоровый образ жизни семьи"
    items: [12, 13, 14, 15, 16, 17]
  family_health_resources:
    name_ru: "Ресурсы здоровья семьи"
    items: [20, 21, 22, 23, 24, 29, 30, 31, 32]
  external_social_supports:
    name_ru: "Внешняя социальная поддержка семьи"
    items: [25, 26, 27, 28]

scoring:
  recode_first: true
  canonical_subscale_statistic: "mean"
  formula: "mean(recode_as_needed(items in scale))"

ranges_if_mean_scored:
  social_emotional_health_processes: [1, 5]
  healthy_lifestyle: [1, 5]
  family_health_resources: [1, 5]
  external_social_supports: [1, 5]

cutoffs: null
short_form_cutoffs_applicable: false

derived:
  long_form_total: null

direction:
  social_emotional_health_processes: higher_is_better
  healthy_lifestyle: higher_is_better
  family_health_resources: higher_is_better
  external_social_supports: higher_is_better

version_match:
  status: exact
  evidence: "Excel Танит содержит 32 пункта FHS-LF в порядке финальной long-form: первые пункты 'Мы редко выражаем привязанность...' и 'Мы редко что-то делаем вместе...' совпадают с реверсивными FHS-LF; полный набор соответствует 32 удержанным пунктам оригинальной шкалы. Ответы представлены значениями 1–5."

quality_status: B_READY_WITH_LIMITATIONS
scoring_ready: true
```

Алгоритм: сначала инвертировать 11 отрицательно сформулированных пунктов по формуле `6 - x`, затем рассчитывать четыре субшкалы. В этом ключе субшкалы нормированы средним значением, чтобы все четыре оставались в общей метрике 1–5 и были сопоставимы по направлению. Исходная статья валидирует четырехфакторную long-form, а клинические cut-off `poor / moderate / excellent` разрабатывает только для отдельной 10-пунктовой FHS-SF. Эти пороги к нашему 32-пунктовому Excel применять нельзя.

Важно: нумерация в Excel Танит – компактная 1–32. В оригинальной статье финальные 32 пункта сохраняют исходные номера из 47-пунктового пула. Ключ выше уже преобразован именно в компактную нумерацию Excel Танит.

## Источники

1. Crandall A. et al. (2020). The Family Health Scale: Reliability and Validity of a Short- and Long-Form. Frontiers in Public Health, 8, 587125. DOI: 10.3389/fpubh.2020.587125. https://www.frontiersin.org/journals/public-health/articles/10.3389/fpubh.2020.587125/full
2. Забелина Е. В., Максименко В. А., Бушуева А. М. (2024). Шкала здоровья семьи: результаты адаптации на российской выборке. Вестник Омского университета. Серия «Психология», 3, 63–73. DOI: 10.24147/2410-6364.2024.3.63-73.

## Направление показателей

После реверсирования отрицательных пунктов все четыре субшкалы направлены одинаково: **чем выше, тем лучше выражены соответствующие ресурсы здоровья семьи**.
