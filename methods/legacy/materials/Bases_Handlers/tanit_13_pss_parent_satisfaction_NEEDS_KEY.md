# PSS Halverson–Duke, 30 пунктов – углубленный статус

```yaml
id: pss_halverson_duke_30
name: "Шкала удовлетворенности родительской ролью"
authors: ["C. F. Halverson", "H. P. Duke"]
adaptation_ru: "Е. В. Куфтяк"
items: 30

excel_match:
  file: "2026-09-02 Шкала удовлетворенности родительской ролью PSS для родителей.xlsx"
  diagnostic_columns: 30
  excel_question_columns: [11, 40]
  item_text_match: exact_to_public_30_item_form
  response_format:
    items_1_29: "7 категорий частоты/согласия"
    item_30: "7 градаций общей удовлетворенности"
  version_match: exact

published_structure:
  parental_pleasure:
    expected_n_items: 8
  parental_burden:
    expected_n_items: 10
  parental_importance:
    expected_n_items: 9
  additional_items_outside_three_subscales:
    expected_n_items: 3
  total_items: 30

foreign_adaptation_example:
  parental_pleasure: [1, 2, 3, 4, 5, 7, 9, 28]
  parental_burden: [10, 17, 18, 19, 20, 21, 24, 25, 27, 30]
  note: "это подтвержденный ключ португальской адаптации; не переносится автоматически на адаптацию Куфтяк"

russian_item_key:
  status: not_found_in_open_primary_source

scoring_ready: false
quality_status: C_NEEDS_VERIFICATION
```

## Что добавлено на этом проходе

Excel Танит проверен по фактическим заголовкам. Это именно 30-пунктовая Parent Satisfaction Scale Halverson & Duke: пункты 1–29 являются утверждениями о родительской роли, пункт 30 – отдельной глобальной самооценкой удовлетворенности.

Найдена публикация, в которой полный 30-item инструмент разделяется на три субшкалы размером 8, 10 и 9 пунктов, причем три пункта остаются вне субшкал. Для португальской адаптации опубликованы конкретные номера части шкал. Однако это не является достаточным основанием заменить ключ российской адаптации Е. В. Куфтяк.

Особенно важно не путать этот инструмент с 18-item Parental Stress Scale Berry & Jones, которая также сокращается как PSS.

## Источники

1. USF Test and Measures Collection – оригинальная 30-item PSS Halverson & Duke.  
   https://tam.rc.usf.edu/node/2690

2. Публичный 30-item бланк, совпадающий с Excel Танит.  
   https://psytests.org/parent/pssrr-bl.html

3. Пример опубликованной трехфакторной структуры 8+10+9 в иностранной адаптации.  
   https://core.ac.uk/download/pdf/160791826.pdf

4. Российские публикации подтверждают использование адаптации Е. В. Куфтяк и трех субшкал, но открытого полного по-пунктового ключа в найденных материалах нет.

## Направление показателей

Общая удовлетворенность: выше – больше удовлетворенность родительской ролью. Для субшкалы «Тяжесть родительской роли» требуется реверсирование в единую позитивную направленность, но конкретный исполняемый ключ российской адаптации пока не подтвержден.
