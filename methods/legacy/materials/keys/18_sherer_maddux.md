# Самоэффективность Шерера–Маддукса – ключ обработки

```yaml
id: sherer_maddux_boyarintseva_23
items: 23
response: {type: signed_likert, min: -5, max: 5, integer: true}
reverse_formula: "-x"
scales:
  activity:
    direct: [1,3,8,9,13,14,15]
    reverse: [2,4,5,6,7,10,11,12,16,17]
  interpersonal:
    direct: [19,23]
    reverse: [18,20,21,22]
formula: "sum(direct x) + sum(reverse -x)"
derived:
  total: "activity + interpersonal"
ranges: {activity: [-85,85], interpersonal: [-30,30], total: [-115,115]}
```

Инвертируется знак ответа, а не позиция на шкале 1–11. Нулевой ответ после инверсии остается нулем. В опубликованных материалах для подростков: предметная самоэффективность выше 58 – высокая, 1–58 – средняя, ниже 1 – низкая; эти границы нельзя автоматически переносить на взрослых.

Источник: https://dip-psi.ru/psikhologicheskiye-testy/post/test-opredeleniya-samoeffektivnosti-d-madduks-i-m-sheer-v-modifikacii-l-boyarincevoj-pod-rukovodstvom-r-l-krichevskogo

## Направление показателей

Предметная, межличностная и общая самоэффективность: **чем выше, тем лучше**.
