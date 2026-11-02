# УВЛК А.И. Шипилова – ключ обработки

```yaml
id: uvlk_shipilov
items: 36
response:
  type: ordinal
  valid: [0, 1, 2, 3]
  labels: {0: "не переживаю / открыто выражаю эмоции", 1: "слегка переживаю", 2: "переживаю", 3: "я в отчаянии"}
missing: reject_scale_if_any_item_missing
scales:
  motivational: [6, 12, 18, 24, 30, 35]
  moral: [5, 11, 17, 23, 29, 36]
  unrealized_desire: [4, 10, 16, 22, 28, 34]
  role: [3, 9, 15, 21, 27, 33]
  adaptation: [1, 8, 14, 20, 26, 32]
  inadequate_self_esteem: [2, 7, 13, 19, 25, 31]
derived:
  motivational_sphere: "motivational + moral + unrealized_desire"
  obligation_sphere: "moral + role + adaptation"
  self_esteem_sphere: "unrealized_desire + adaptation + inadequate_self_esteem"
  total: "sum(scales.*)"
ranges:
  each_scale: [0, 18]
  each_sphere: [0, 54]
  total: [0, 108]
total_levels:
  - {min: 0, max: 6, label: extremely_low}
  - {min: 7, max: 29, label: low}
  - {min: 30, max: 49, label: medium}
  - {min: 50, max: 74, label: high}
  - {min: 75, max: 108, label: very_high}
```

Алгоритм: проверить 36 ответов, просуммировать ответы внутри шести непересекающихся шкал, затем вычислить три сферы и общий показатель. В публичных копиях встречается ошибочное кодирование четвертой категории как 4. Оно несовместимо с диапазоном 0–3 и здесь не используется.

Источник: https://dip-psi.ru/psikhologicheskiye-testy/post/test-po-vyyavleniyu-urovnya-vnutrilichnostnoj-konfliktnosti-a-i-shipilov

## Направление показателей

Все шкалы, три сферы и общий показатель: **чем выше, тем хуже**. Рост означает усиление внутриличностной конфликтности.
