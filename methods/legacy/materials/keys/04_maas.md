# MAAS – ключ обработки

```yaml
id: maas_15
items: 15
response:
  type: frequency
  valid: [1, 2, 3, 4, 5, 6]
  labels: {1: almost_always, 2: very_frequently, 3: somewhat_frequently, 4: somewhat_infrequently, 5: very_infrequently, 6: almost_never}
scales:
  mindfulness:
    direct: [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15]
formula: "mean(items 1..15)"
range: [1, 6]
direction: higher_is_more_mindfulness
missing:
  recommended: "score if at least 12 valid; mean over valid items; report n_valid"
cutoffs: null
```

Утверждения описывают невнимательность, но шкала ответов направлена от «почти всегда» к «почти никогда». Поэтому при кодировании ответов строго как 1–6 пункты дополнительно не реверсируются. Если в данных категории закодированы в обратном порядке, сначала применить `x = 7 - x`.

Источник: https://psytests.org/cbt/maas.html

## Направление показателей

Осознанность: **чем выше, тем лучше**.
