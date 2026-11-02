# Устремленность на семейное долголетие В. С. Торохтия, 30 пунктов – углубленный статус

```yaml
id: family_longevity_torokhtiy_30
author: "В. С. Торохтий"
items: 30

excel_match:
  file: "2026-09-02 Устремленность на семейное долголетие для семей без детей.xlsx"
  diagnostic_columns: 30
  excel_question_columns: [10, 39]
  item_text_match: exact_to_primary_form
  version_match: exact

response:
  type: item_specific_three_category
  coding:
    a: 2
    b: 1
    c: 0

components:
  cognitive:
    label: "Познавательный"
  motivational:
    label: "Мотивационный"
  emotional:
    label: "Эмоциональный"
  volitional:
    label: "Волевой"
  family_stabilization:
    label: "Стабилизация семьи"

coefficient:
  name: "КУСД"
  published_formula: "0.05 * (PK + MK + EK + VK) + 0.025 * FSS"
  note: "в первичном тексте компоненты описаны как средние значения; требуется использовать авторскую схему агрегации после подтверждения item→component mapping"
  levels:
    low: "< 0.375"
    medium: "0.375 .. 0.65"
    high: "> 0.65"

item_to_component:
  status: not_confirmed

scoring_ready: false
quality_status: C_NEEDS_VERIFICATION
```

## Новая проверка

Excel Танит полностью совпадает с 30 вопросами первичного бланка Торохтия. В ответах сохраняются буквенные категории `а/б/в`, поэтому обработчик должен кодировать не текст ответа как таковой, а ведущую категорию: `а=2`, `б=1`, `в=0`.

Найден открытый результат расчета этой же методики, который подтверждает, что система действительно выводит пять компонентных средних и итоговый коэффициент КУСД в диапазоне около 0–1. В примере: познавательный 1.20, мотивационный 1.40, эмоциональный 1.40, волевой 1.60, стабилизация 1.40, КУСД = 0.70.

Однако без авторского распределения 30 пунктов по пяти компонентам переносить этот расчет в наш автообработчик нельзя.

## Источники

1. Торохтий В. С. Методика диагностики психологического здоровья семьи. М.: МГПУ, 2006.  
   https://www.studmed.ru/view/torohtiy-vs-metodika-diagnostiki-psihologicheskogo-zdorovya-semi_c878fea16e7.html?page=9

2. Публичная реализация по первоисточнику:  
   https://psytests.org/family/torohI.html

3. Пример вывода пяти компонентов и коэффициента КУСД:  
   https://psytests.org/result?v=tohIXrgk

## Направление показателей

КУСД: **чем выше, тем выраженнее устремленность на семейное долголетие**. Авторские уровни: низкий <0.375, средний 0.375–0.65, высокий >0.65.
