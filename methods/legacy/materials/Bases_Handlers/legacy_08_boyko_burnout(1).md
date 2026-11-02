# Выгорание В.В. Бойко – полный взвешенный ключ

```yaml
id: boyko_burnout_84
items: 84
response: {valid: [0,1], labels: {0: "no", 1: "yes"}}
match_rule: "plus matches yes; minus matches no; add specified weight"
symptoms:
  psychotraumatic: ["+1:2","+13:3","+25:2","-37:3","+49:10","+61:5","-73:5"]
  dissatisfaction: ["-2:3","+14:2","+26:2","-38:10","-50:5","+62:5","+74:3"]
  trapped: ["+3:10","+15:5","+27:2","+39:2","+51:5","+63:1","-75:5"]
  anxiety_depression: ["+4:2","+16:3","+28:5","+40:5","+52:10","+64:2","+76:3"]
  inadequate_emotional_response: ["+5:5","-17:3","+29:10","+41:2","+53:2","+65:3","+77:5"]
  emotional_moral_disorientation: ["+6:10","-18:3","+30:3","+42:5","+54:2","+66:2","-78:5"]
  economy_of_emotions: ["+7:2","+19:10","-31:2","+43:5","+55:3","+67:3","-79:5"]
  reduction_of_duties: ["+8:5","+20:5","+32:2","-44:2","+56:3","+68:3","+80:10"]
  emotional_deficit: ["+9:3","+21:2","+33:5","-45:5","+57:3","-69:10","+81:2"]
  emotional_detachment: ["+10:2","+22:3","-34:2","+46:3","+58:5","+70:5","+82:10"]
  depersonalization: ["+11:5","+23:3","+35:3","+47:5","+59:5","+72:2","+83:10"]
  psychosomatic: ["+12:3","+24:2","+36:5","+48:3","+60:2","+72:10","+84:5"]
phases:
  tension: [psychotraumatic, dissatisfaction, trapped, anxiety_depression]
  resistance: [inadequate_emotional_response, emotional_moral_disorientation, economy_of_emotions, reduction_of_duties]
  exhaustion: [emotional_deficit, emotional_detachment, depersonalization, psychosomatic]
derived:
  phase_score: "sum(4 symptoms)"
  total: "sum(12 symptoms)"
ranges: {symptom: [0,30], phase: [0,120], total: [0,360]}
symptom_levels: {unformed: [0,9], forming: [10,15], formed: [16,30], dominant_from: 20}
phase_levels: {unformed: [0,36], forming: [37,60], formed: [61,120]}
```

Пункт 72 намеренно входит в две шкалы с разными весами. Это не дубликат при суммировании ответов, а особенность опубликованного ключа. Сначала вычисляются 12 симптомов, затем три фазы; простая сумма совпавших ответов неверна.

Источник: https://psylab.info/Методика_диагностики_уровня_профессионального_выгорания_Бойко

## Направление показателей

Все симптомы, фазы и общий показатель выгорания: **чем выше, тем хуже**.
