# MBI-HSS, 22 пункта – ключ обработки

```yaml
id: mbi_hss_22
edition_required: MBI-HSS
items: 22
license: proprietary
response:
  type: frequency
  valid: [0, 1, 2, 3, 4, 5, 6]
  anchors: {0: never, 6: every_day}
missing: use_manual_rules
scales:
  emotional_exhaustion:
    direct: [1, 2, 3, 6, 8, 13, 14, 16, 20]
  depersonalization:
    direct: [5, 10, 11, 15, 22]
  personal_accomplishment:
    direct: [4, 7, 9, 12, 17, 18, 19, 21]
formula: "raw_scale = sum(item responses)"
ranges:
  emotional_exhaustion: [0, 54]
  depersonalization: [0, 30]
  personal_accomplishment: [0, 48]
direction:
  emotional_exhaustion: higher_is_more_burnout
  depersonalization: higher_is_more_burnout
  personal_accomplishment: lower_is_more_burnout
```

Не инвертировать пункты личных достижений при расчете опубликованной шкалы PA. Если нужен единонаправленный исследовательский индекс, создайте отдельную производную `reduced_accomplishment = 48 - PA` и не называйте ее исходной PA. Универсальные пороги не заданы: они зависят от редакции, профессии, языка и нормативной выборки. Перед запуском проверить, что анкета именно MBI-HSS на 22 пункта, а не MBI-ES или MBI-GS.

Официальная страница и лицензирование: https://www.mindgarden.com/117-maslach-burnout-inventory-mbi

## Направление показателей

- Эмоциональное истощение, деперсонализация и редукция профессиональных достижений: **чем выше, тем хуже**.
- Профессиональные достижения: **чем выше, тем лучше**.
