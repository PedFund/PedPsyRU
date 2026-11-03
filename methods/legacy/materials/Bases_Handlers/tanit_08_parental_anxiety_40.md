# Методика диагностики родительской тревожности А. М. Прихожан, 40 пунктов

```yaml
id: parental_anxiety_prikhozhan_40
author: "А. М. Прихожан"
items: 40

excel_match:
  diagnostic_columns: 40
  excel_question_columns: [11, 50]
  response_values: [1, 2, 3, 4, 5]
  version_match: exact

response:
  type: likert
  valid: [1, 2, 3, 4, 5]
  labels:
    1: "совершенно не похоже на меня"
    2: "не похоже на меня"
    3: "затрудняюсь ответить"
    4: "похоже на меня"
    5: "очень похоже на меня"

reverse:
  formula: "6 - x"

scales:
  parental_anxiety:
    direct: [1, 3, 10, 11, 13, 14, 19, 21, 26, 28, 31, 35, 37, 39]
    reverse: [6, 7, 16, 23, 32, 40]
    formula: sum
    range: [20, 100]

  emotional_distress:
    label: "Эмоциональное неблагополучие / общая тревожность"
    direct: [2, 4, 5, 9, 17, 22, 25, 27, 29, 30, 33, 34, 36, 38]
    reverse: [8, 12, 15, 18, 20, 24]
    formula: sum
    range: [20, 100]

derived:
  total_anxiety:
    formula: "parental_anxiety + emotional_distress"
    range: [40, 200]

sten_interpretation:
  1_2: "состояние тревожности не свойственно / возможное чрезмерное спокойствие"
  3_6: "нормальный уровень"
  7_8: "несколько повышенная тревожность"
  9: "явно повышенная тревожность"
  10: "очень высокая тревожность"

norm_tables:
  status: partial
  note: "таблицы перевода сырых баллов в стены зависят от пола; в текущий файл не зашиваются до полной сверки мужской и женской таблиц"

direction:
  parental_anxiety: higher_is_worse
  emotional_distress: higher_is_worse
  total_anxiety: higher_is_worse

scoring_ready: true
quality_status: B_READY_WITH_LIMITATIONS
```

Excel Танит полностью совпадает с опубликованной 40-пунктовой формой: те же формулировки и 5-балльные ответы. Две субшкалы содержат по 20 пунктов, все 40 пунктов покрыты ключом ровно один раз. Для обратных пунктов применяется `6-x`.

## Источники

1. А. М. Прихожан. Психология тревожности: дошкольный и школьный возраст. СПб.: Питер, 2009.
2. Публикация ключа с распределением прямых и обратных пунктов:
   https://www.inclusive-edu.ru/wp-content/uploads/2022/03/13_rossijskie_i_zarubezhnye_issledovanija_v_oblasti_inkljuzivnogo_obrazovanija.sbornik.pdf
3. Контроль структуры и нормативной интерпретации:
   https://psytests.org/anxiety/prtR.html

## Направление показателей

Все три расчетных показателя: чем выше, тем выраженнее тревожность / эмоциональное неблагополучие.
