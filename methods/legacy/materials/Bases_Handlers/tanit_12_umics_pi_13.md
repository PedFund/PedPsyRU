# U-MICS-PI, русская 13-пунктовая версия – ключ обработки

```yaml
id: umics_pi_ru_13
name: "Утрехтская шкала родительской идентичности U-MICS-PI"
original_name: "Utrecht-Management of Identity Commitments Scale – Parental Identity"
author: "Konrad Piotrowski"
adaptation: "Ю. В. Борисенко, 2021"
version: "Russian 13-item parental identity version"
items: 13

response:
  type: likert
  valid: [1, 2, 3, 4, 5]
  labels:
    1: "совершенно неверно"
    2: "неверно"
    3: "в чем-то верно, в чем-то неверно"
    4: "верно"
    5: "совершенно верно"

missing:
  rule: not_specified

scales:
  commitment:
    direct: [1, 2, 3, 4, 5]
  in_depth_exploration:
    direct: [6, 7, 8, 9, 10]
  reconsideration_of_commitment:
    direct: [11, 12, 13]

reverse_items: []

formula:
  raw_sum: "sum(scale items)"
  mean: "raw_sum / number_of_valid_scale_items"

ranges:
  commitment_sum: [5, 25]
  commitment_mean: [1, 5]
  in_depth_exploration_sum: [5, 25]
  in_depth_exploration_mean: [1, 5]
  reconsideration_of_commitment_sum: [3, 15]
  reconsideration_of_commitment_mean: [1, 5]

cutoffs: null
levels: null

primary_output:
  recommended: mean
  reason: "subscales have unequal item counts (5/5/3); mean preserves the original 1–5 metric"
  source_status: "choice for processor comparability; publications confirm subscale composition but do not state a universal sum-vs-mean rule in the accessible text"

direction:
  commitment: higher_is_more_commitment
  in_depth_exploration: higher_is_more_exploration
  reconsideration_of_commitment: higher_is_more_reconsideration

version_match:
  status: exact
  evidence: "Excel Танит contains 13 diagnostic items in the same 5+5+3 order used in the Russian adaptation and later 13-item U-MICS-PI publications; response scale is 1–5."

quality_status: B_READY_WITH_LIMITATIONS
scoring_ready: true
```

## Алгоритм

1. Проверить 13 ответов в диапазоне 1–5.
2. Дополнительное реверсирование не выполнять.
3. Рассчитать три самостоятельные шкалы: обязательство 1–5, углубленное исследование 6–10, пересмотр обязательства 11–13.
4. Сохранять как сумму, так и среднее. Для сопоставимости трех шкал в аналитике использовать среднее 1–5.
5. Общую сумму U-MICS-PI не рассчитывать: модель является трехфакторной.
6. Универсальные границы «низкий/средний/высокий» не заданы.

## Критическое замечание о версии

В первой публикации Piotrowski для родительской идентичности использовалась 12-пунктовая версия: 5 пунктов обязательства, 5 углубленного исследования и 2 пересмотра обязательства. В более поздних публикациях и в российской адаптации используется 13 пунктов с тремя пунктами пересмотра. Форма Танит фактически соответствует 13-пунктовой версии, поэтому 12-item ключ 2018 года механически применять нельзя.

## Источники

1. Borisenko Yu. V. (2021). Adaptation of the Utrecht-Management of Identity Commitments Scale-Parental Identity (U-MICS-PI modified by K. Piotrowski). Psychology. Psychophysiology, 14(2), 17–26. DOI: 10.14529/jpps210202.
2. Piotrowski K. (2018). Adaptation of the Utrecht-Management of Identity Commitments Scale (U-MICS) to the measurement of the parental identity domain. Scandinavian Journal of Psychology, 59. DOI: 10.1111/sjop.12416.
3. Later U-MICS-PI studies using the 13-item 5/5/3 structure, including Piotrowski et al. cross-cultural and parental-identity studies.

## Направление показателей

- Обязательство: высокий балл означает более сильную идентификацию и устойчивость обязательства в родительской сфере. Это не универсальная шкала «лучше/хуже», хотя в исходных исследованиях более сильное обязательство связано с более благоприятной адаптацией.
- Углубленное исследование: высокий балл означает более активное осмысление и изучение собственного родительства; интерпретация контекстно зависима.
- Пересмотр обязательства: высокий балл означает более выраженные сомнения в принятом родительском обязательстве и мысли о его пересмотре; содержательно это проблемный полюс, но его не реверсируют при расчете исходной шкалы.
