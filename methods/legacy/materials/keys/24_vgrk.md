# ВГРК – полный ключ обработки

```yaml
id: vgrk_50
items: 50
response: {type: signed_likert, valid: [-3,-2,-1,0,1,2,3]}
direct_formula: "x + 3"
reverse_formula: "-x + 3"
scales:
  gender: {direct: [5,15,25,35,45], reverse: [10,20,30,40,50]}
  professional: {direct: [7,17,27,37,47], reverse: [4,14,24,34,44]}
  spouse: {direct: [9,19,29,39,49], reverse: [2,12,22,32,42]}
  household: {direct: [1,11,21,31,41], reverse: [6,16,26,36,46]}
  parent: {direct: [3,13,23,33,43], reverse: [8,18,28,38,48]}
derived: {total: "sum(all five scales)"}
ranges: {each_scale: [0,60], total: [0,300]}
sex_norms:
  male:
    low: {gender: [0,12], professional: [0,15], parent: [0,19], spouse: [0,21], household: [0,19], total: [0,105]}
    below_average: {gender: [13,19], professional: [16,22], parent: [20,24], spouse: [22,26], household: [20,25], total: [106,125]}
    average: {gender: [20,26], professional: [23,29], parent: [25,29], spouse: [27,31], household: [26,31], total: [126,143]}
    above_average: {gender: [27,32], professional: [30,37], parent: [30,35], spouse: [32,38], household: [32,38], total: [144,160]}
    high: {gender: [33,60], professional: [38,60], parent: [36,60], spouse: [39,60], household: [39,60], total: [161,300]}
  female:
    low: {gender: [0,11], professional: [0,14], parent: [0,19], spouse: [0,19], household: [0,22], total: [0,104]}
    below_average: {gender: [12,22], professional: [15,23], parent: [20,27], spouse: [20,26], household: [23,29], total: [105,130]}
    average: {gender: [23,32], professional: [24,33], parent: [28,36], spouse: [27,32], household: [30,38], total: [131,174]}
    above_average: {gender: [33,47], professional: [34,44], parent: [37,47], spouse: [33,39], household: [39,47], total: [175,207]}
    high: {gender: [48,60], professional: [45,60], parent: [48,60], spouse: [40,60], household: [48,60], total: [208,300]}
```

Все 50 пунктов покрыты ровно один раз. Сначала преобразовать исходный ответ -3…+3 в 0…6 с учетом направления, затем суммировать десять пунктов каждой шкалы. Для норм требуется поле пола используемой нормативной группы; при его отсутствии вернуть только сырые баллы.

Источник: https://psytests.org/family/vgrk.html

## Направление показателей

Пять сфер и общий показатель ВГРК: **чем выше, тем хуже**. Рост означает усиление гендерного ролевого конфликта.
