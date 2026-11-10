// Participant-facing presentation for approved releases. Display data only:
// it never changes forms, keys, scoring, norms or historical results.
type LevelTable = Record<string, string>;
type MeasureMeta = {label?: string; min: number; max: number; colors: number; description?: string | null; level_template?: string; level_code?: string; levels?: LevelTable};
type GroupMeta = {title: string; description?: string | null; measures: string[]};
type SummaryMeta = {title: string; measures: string[]; level_code: string; colors: number; level_template?: string; levels?: LevelTable; levels_order?: string[]};
type MethodView = {title: string; note?: string; item_count?: number; item_unit?: string; palette?: "positive" | "negative"; summary_position?: "top" | "bottom"; level_templates?: Record<string, LevelTable>; measures: Record<string, MeasureMeta>; groups: GroupMeta[]; summary?: SummaryMeta};
type Catalog = {schema_version: string; note?: string; methods: Record<string, MethodView>};
type MeasureInput = {code: string; label: string; value: number};
export type PresentedMeasure = {code: string; label: string; value: number; min: number | null; max: number | null; colors: number; description: string | null; level: string | null; level_index: number; level_text: string | null};
export type PresentedGroup = {title: string; description: string | null; measures: PresentedMeasure[]};
export type PresentedLevel = {code: string; value: string; text: string | null; index: number; count: number};
export type PresentedSummary = {title: string; colors: number; measures: PresentedMeasure[]; level: PresentedLevel | null};
export type PresentationView = {method_version_id: string; title: string; note: string | null; item_count: number | null; item_unit: string | null; palette: "positive" | "negative"; summary_position: "top" | "bottom"; groups: PresentedGroup[]; summary: PresentedSummary | null};

const LEVEL_LABELS: Record<string, string> = {
  low: "низкий",
  medium: "средний",
  high: "высокий",
  very_low: "очень низкий",
  extremely_low: "крайне низкий",
  very_high: "очень высокий",
  "низкий": "низкий",
  "средний": "средний",
  "высокий": "высокий",
  "очень низкий": "очень низкий",
  "крайне низкий": "крайне низкий",
  "очень высокий": "очень высокий",
  "псевдовысокий": "псевдовысокий"
};

export function normalizeLevel(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const value = raw.trim();
  if (!value) return "";
  const known = LEVEL_LABELS[value];
  if (known !== undefined) return known;
  // Never leak an unknown machine code into the participant screen.
  return /^[a-z][a-z0-9_]*$/.test(value) ? "" : value;
}

const catalog: Catalog = {
  "schema_version": "1.0.0",
  "note": "Participant-facing presentation for approved releases. Display data only: it does not change forms, keys, scoring or norms.",
  "methods": {
    "motkov_psychological_culture_18@1.0.0-staging": {
      "title": "Психологическая культура личности",
      "summary_position": "bottom",
      "level_templates": {
        "A": {
          "низкий": "По вашим ответам это стремление выражено слабо.",
          "средний": "По вашим ответам это стремление выражено умеренно.",
          "высокий": "По вашим ответам это стремление выражено сильно.",
          "псевдовысокий": "По вашим ответам стремление выражено очень сильно. Методика выделяет самые высокие самооценки в отдельную категорию."
        },
        "B": {
          "низкий": "По вашим ответам вы мало воплощаете это стремление в повседневной жизни.",
          "средний": "По вашим ответам вы воплощаете это стремление в повседневной жизни в умеренной степени.",
          "высокий": "По вашим ответам вы в значительной мере воплощаете это стремление в повседневной жизни.",
          "псевдовысокий": "По вашим ответам вы в большой мере воплощаете это стремление в повседневной жизни. Методика выделяет самые высокие самооценки в отдельную категорию."
        },
        "gpk": {
          "низкий": "По сочетанию ваших ответов стремления слабо выражены или в малой мере воплощаются в повседневной жизни.",
          "средний": "Сочетание силы стремлений и их осуществления соответствует среднему уровню. Такой результат возможен и при заметной разнице между ними.",
          "высокий": "По вашим ответам стремления выражены как минимум умеренно, а в повседневной жизни вы воплощаете их в значительной мере.",
          "псевдовысокий": "По вашим ответам вы в большой мере воплощаете свои стремления в повседневной жизни. Общий уровень учитывает также то, насколько сильно выражены сами стремления."
        }
      },
      "measures": {
        "I_A": {
          "label": "Стремление",
          "min": 1,
          "max": 5,
          "colors": 4,
          "level_template": "A"
        },
        "I_B": {
          "label": "Осуществление",
          "min": 1,
          "max": 5,
          "colors": 4,
          "level_template": "B"
        },
        "II_A": {
          "label": "Стремление",
          "min": 1,
          "max": 5,
          "colors": 4,
          "level_template": "A"
        },
        "II_B": {
          "label": "Осуществление",
          "min": 1,
          "max": 5,
          "colors": 4,
          "level_template": "B"
        },
        "III_A": {
          "label": "Стремление",
          "min": 1,
          "max": 5,
          "colors": 4,
          "level_template": "A"
        },
        "III_B": {
          "label": "Осуществление",
          "min": 1,
          "max": 5,
          "colors": 4,
          "level_template": "B"
        },
        "IV_A": {
          "label": "Стремление",
          "min": 1,
          "max": 5,
          "colors": 4,
          "level_template": "A"
        },
        "IV_B": {
          "label": "Осуществление",
          "min": 1,
          "max": 5,
          "colors": 4,
          "level_template": "B"
        },
        "V_A": {
          "label": "Стремление",
          "min": 1,
          "max": 5,
          "colors": 4,
          "level_template": "A"
        },
        "V_B": {
          "label": "Осуществление",
          "min": 1,
          "max": 5,
          "colors": 4,
          "level_template": "B"
        },
        "VI_A": {
          "label": "Стремление",
          "min": 1,
          "max": 5,
          "colors": 4,
          "level_template": "A"
        },
        "VI_B": {
          "label": "Осуществление",
          "min": 1,
          "max": 5,
          "colors": 4,
          "level_template": "B"
        },
        "pk_A": {
          "label": "Стремление (общий)",
          "min": 1,
          "max": 5,
          "colors": 4,
          "level_template": "A"
        },
        "pk_B": {
          "label": "Осуществление (общий)",
          "min": 1,
          "max": 5,
          "colors": 4,
          "level_template": "B"
        }
      },
      "groups": [
        {
          "title": "Самопознание",
          "description": "Понимать свои желания, особенности характера и причины своих реакций.",
          "measures": [
            "I_A",
            "I_B"
          ]
        },
        {
          "title": "Конструктивное общение",
          "description": "Слушать других, ясно выражать свои мысли и искать решение при разногласиях.",
          "measures": [
            "II_A",
            "II_B"
          ]
        },
        {
          "title": "Психическая саморегуляция",
          "description": "Управлять своими эмоциями и действиями и находить способы улучшить своё состояние.",
          "measures": [
            "III_A",
            "III_B"
          ]
        },
        {
          "title": "Творческое поведение",
          "description": "Пробовать новое, придумывать идеи и воплощать их на практике.",
          "measures": [
            "IV_A",
            "IV_B"
          ]
        },
        {
          "title": "Конструктивность в делах",
          "description": "Реалистично планировать дела, держать обещания и доводить важное до конца.",
          "measures": [
            "V_A",
            "V_B"
          ]
        },
        {
          "title": "Гармонизирующее саморазвитие",
          "description": "Развивать привычки и установки, которые помогают улучшать повседневную жизнь.",
          "measures": [
            "VI_A",
            "VI_B"
          ]
        }
      ],
      "summary": {
        "title": "Общий уровень гармоничности",
        "measures": [
          "pk_A",
          "pk_B"
        ],
        "level_code": "gpk",
        "colors": 4,
        "level_template": "gpk",
        "levels_order": [
          "низкий",
          "средний",
          "высокий",
          "псевдовысокий"
        ]
      }
    },
    "ryff_pwb_84_shevelenkova_fesenko@1.0.0-staging": {
      "title": "Психологическое благополучие",
      "measures": {
        "positive_relations": {
          "min": 14,
          "max": 84,
          "colors": 2,
          "description": "Теплоту и доверие в отношениях, способность сопереживать и поддерживать близость."
        },
        "autonomy": {
          "min": 14,
          "max": 84,
          "colors": 2,
          "description": "Самостоятельность суждений и опору на собственные критерии при оценке себя и своих решений."
        },
        "environment_mastery": {
          "min": 14,
          "max": 84,
          "colors": 2,
          "description": "Умение организовывать повседневные дела, использовать возможности и создавать подходящие для себя условия."
        },
        "personal_growth": {
          "min": 14,
          "max": 84,
          "colors": 2,
          "description": "Ощущение собственного развития, открытость новому опыту и готовность меняться."
        },
        "purpose_in_life": {
          "min": 14,
          "max": 84,
          "colors": 2,
          "description": "Наличие целей и ощущение, что у жизни есть направление и смысл."
        },
        "self_acceptance": {
          "min": 14,
          "max": 84,
          "colors": 2,
          "description": "Отношение к себе, принятие своих сильных и слабых сторон и своего прошлого."
        },
        "overall": {
          "label": "Общий балл",
          "min": 84,
          "max": 504,
          "colors": 3
        }
      },
      "groups": [
        {
          "title": "Шесть сторон благополучия",
          "description": null,
          "measures": [
            "positive_relations",
            "autonomy",
            "environment_mastery",
            "personal_growth",
            "purpose_in_life",
            "self_acceptance"
          ]
        }
      ],
      "summary": {
        "title": "Общий уровень",
        "measures": [
          "overall"
        ],
        "level_code": "overall",
        "colors": 3,
        "levels": {
          "низкий": "В целом признаки психологического благополучия, которые оценивает опросник, выражены слабо. По профилю ниже можно увидеть, как различаются результаты по отдельным сторонам благополучия.",
          "средний": "В целом признаки психологического благополучия, которые оценивает опросник, выражены умеренно. Результаты по отдельным сторонам благополучия могут различаться.",
          "высокий": "В целом признаки психологического благополучия, которые оценивает опросник, хорошо выражены. Профиль ниже показывает результаты по отдельным сторонам благополучия."
        },
        "levels_order": [
          "низкий",
          "средний",
          "высокий"
        ]
      }
    },
    "tki_ru_30_pairs@1.0.0": {
      "title": "Томас–Килманн: стили поведения в конфликте",
      "note": "Нормативные уровни для этой методики не утверждены.",
      "item_count": 30,
      "item_unit": "пар",
      "measures": {
        "competing": {"label": "Соперничество", "min": 0, "max": 12, "colors": 2},
        "collaborating": {"label": "Сотрудничество", "min": 0, "max": 12, "colors": 2},
        "compromising": {"label": "Компромисс", "min": 0, "max": 12, "colors": 2},
        "avoiding": {"label": "Избегание", "min": 0, "max": 12, "colors": 2},
        "accommodating": {"label": "Приспособление", "min": 0, "max": 12, "colors": 2}
      },
      "groups": [
        {"title": "Стили поведения", "description": null, "measures": ["competing", "collaborating", "compromising", "avoiding", "accommodating"]}
      ]
    },
    "ttf_atf_10@1.0.0-staging": {
      "title": "Склонность к прощению и отношение к прощению",
      "note": "Нормативные уровни для этой методики не утверждены.",
      "item_count": 10,
      "measures": {
        "TTF": {"label": "Тенденция к прощению", "min": 4, "max": 28, "colors": 2},
        "ATF": {"label": "Отношение к прощению", "min": 6, "max": 42, "colors": 2}
      },
      "groups": [
        {"title": "Шкалы", "description": null, "measures": ["TTF", "ATF"]}
      ]
    },
    "pvq_rr_57@1.0.0-staging": {
      "title": "Портретный ценностный опросник Шварца",
      "note": "Нормативные уровни для этой методики не утверждены.",
      "item_count": 57,
      "summary_position": "top",
      "measures": {
        "SDT": {"label": "Самостоятельность / мысли", "min": 1, "max": 6, "colors": 2},
        "SDA": {"label": "Самостоятельность / действия", "min": 1, "max": 6, "colors": 2},
        "ST": {"label": "Стимуляция", "min": 1, "max": 6, "colors": 2},
        "HE": {"label": "Гедонизм", "min": 1, "max": 6, "colors": 2},
        "AC": {"label": "Достижение", "min": 1, "max": 6, "colors": 2},
        "FOR": {"label": "Власть / ресурсы", "min": 1, "max": 6, "colors": 2},
        "FOD": {"label": "Власть / доминирование", "min": 1, "max": 6, "colors": 2},
        "FAC": {"label": "Репутация", "min": 1, "max": 6, "colors": 2},
        "SES": {"label": "Безопасность / общественная", "min": 1, "max": 6, "colors": 2},
        "SEP": {"label": "Безопасность / личная", "min": 1, "max": 6, "colors": 2},
        "COR": {"label": "Конформность / правила", "min": 1, "max": 6, "colors": 2},
        "COI": {"label": "Конформность / межличностная", "min": 1, "max": 6, "colors": 2},
        "TR": {"label": "Традиция", "min": 1, "max": 6, "colors": 2},
        "HUM": {"label": "Скромность", "min": 1, "max": 6, "colors": 2},
        "BED": {"label": "Благожелательность / долг", "min": 1, "max": 6, "colors": 2},
        "BEC": {"label": "Благожелательность / забота", "min": 1, "max": 6, "colors": 2},
        "UNC": {"label": "Универсализм / забота", "min": 1, "max": 6, "colors": 2},
        "UNN": {"label": "Универсализм / природа", "min": 1, "max": 6, "colors": 2},
        "UNT": {"label": "Универсализм / толерантность", "min": 1, "max": 6, "colors": 2},
        "self_transcendence": {"label": "Самопреодоление", "min": 1, "max": 6, "colors": 2},
        "self_enhancement": {"label": "Самоутверждение", "min": 1, "max": 6, "colors": 2},
        "openness_to_change": {"label": "Открытость изменениям", "min": 1, "max": 6, "colors": 2},
        "conservation": {"label": "Сохранение", "min": 1, "max": 6, "colors": 2}
      },
      "groups": [
        {"title": "Самопреодоление", "description": null, "measures": ["UNC", "UNN", "UNT", "BEC", "BED"]},
        {"title": "Самоутверждение", "description": null, "measures": ["AC", "FOR", "FOD", "FAC"]},
        {"title": "Открытость изменениям", "description": null, "measures": ["SDT", "SDA", "ST", "HE"]},
        {"title": "Сохранение", "description": null, "measures": ["SES", "SEP", "COR", "COI", "TR", "HUM"]}
      ],
      "summary": {
        "title": "Ценностные индексы",
        "measures": ["self_transcendence", "self_enhancement", "openness_to_change", "conservation"],
        "level_code": "",
        "colors": 2
      }
    },
    "qlesq_36_vodopyanova@1.1.0-staging": {
      "title": "Шкала оценки качества жизни",
      "summary_position": "top",
      "level_templates": {
        "four": {"очень низкий": "", "низкий": "", "средний": "", "высокий": ""}
      },
      "measures": {
        "work": {"label": "Работа", "min": 4, "max": 40, "colors": 2},
        "achievement": {"label": "Достижения", "min": 4, "max": 40, "colors": 2},
        "health": {"label": "Здоровье", "min": 4, "max": 40, "colors": 2},
        "close_relations": {"label": "Близкие отношения", "min": 4, "max": 40, "colors": 2},
        "support": {"label": "Поддержка", "min": 4, "max": 40, "colors": 2},
        "optimism": {"label": "Оптимизм", "min": 4, "max": 40, "colors": 2},
        "tension": {"label": "Напряжённость", "min": 4, "max": 40, "colors": 2},
        "self_control": {"label": "Самоконтроль", "min": 4, "max": 40, "colors": 2},
        "negative_emotions": {"label": "Негативные эмоции", "min": 4, "max": 40, "colors": 2},
        "quality_of_life_index": {"label": "Индекс качества жизни", "min": 4, "max": 40, "colors": 4, "level_template": "four"}
      },
      "groups": [
        {
          "title": "Шкалы",
          "description": null,
          "measures": ["work", "achievement", "health", "close_relations", "support", "optimism", "tension", "self_control", "negative_emotions"]
        }
      ],
      "summary": {
        "title": "Индекс качества жизни",
        "measures": ["quality_of_life_index"],
        "level_code": "quality_of_life_index",
        "colors": 4,
        "levels_order": ["очень низкий", "низкий", "средний", "высокий"]
      }
    },
    "reflexivity_karpov_27@1.0.0-local": {
      "title": "Рефлексивность",
      "summary_position": "top",
      "level_templates": {
        "three": {"низкий": "", "средний": "", "высокий": ""}
      },
      "measures": {
        "reflexivity_sten": {"label": "Рефлексивность (стен)", "min": 1, "max": 10, "colors": 3, "level_template": "three", "level_code": "reflexivity_level"}
      },
      "groups": [],
      "summary": {
        "title": "Уровень рефлексивности",
        "measures": ["reflexivity_sten"],
        "level_code": "reflexivity_level",
        "colors": 3,
        "levels_order": ["низкий", "средний", "высокий"]
      }
    },
    "sjo_20@1.0.0-staging": {
      "title": "Смысложизненные ориентации",
      "summary_position": "top",
      "level_templates": {
        "three": {"низкий": "", "средний": "", "высокий": ""}
      },
      "measures": {
        "goals": {"min": 6, "max": 42, "colors": 3, "level_template": "three"},
        "process": {"min": 6, "max": 42, "colors": 3, "level_template": "three"},
        "result": {"min": 5, "max": 35, "colors": 3, "level_template": "three"},
        "locus_self": {"min": 4, "max": 28, "colors": 3, "level_template": "three"},
        "locus_life": {"min": 6, "max": 42, "colors": 3, "level_template": "three"},
        "meaningfulness_total": {"label": "Общий балл", "min": 20, "max": 140, "colors": 3, "level_template": "three"}
      },
      "groups": [
        {
          "title": "Субшкалы",
          "description": null,
          "measures": ["goals", "process", "result", "locus_self", "locus_life"]
        }
      ],
      "summary": {
        "title": "Общая осмысленность жизни",
        "measures": ["meaningfulness_total"],
        "level_code": "meaningfulness_total",
        "colors": 3,
        "levels_order": ["низкий", "средний", "высокий"]
      }
    },
    "co36_kunitsyna_36@1.0.0-staging": {
      "title": "ЦО-36, семейные ценности",
      "note": "Нормативные уровни для этой методики не утверждены.",
      "measures": {
        "family_safety": {"label": "Безопасность семьи", "min": 1, "max": 12, "colors": 2},
        "family_traditions": {"label": "Традиции семьи", "min": 1, "max": 12, "colors": 2},
        "family_interpersonal_relations": {"label": "Межличностные отношения в семье", "min": 1, "max": 12, "colors": 2},
        "family_normative_conformity": {"label": "Нормативная конформность в семье", "min": 1, "max": 12, "colors": 2},
        "individual_achievement": {"label": "Личные достижения", "min": 1, "max": 12, "colors": 2},
        "individual_power_influence": {"label": "Власть и влияние", "min": 1, "max": 12, "colors": 2},
        "individual_hedonism": {"label": "Гедонизм", "min": 1, "max": 12, "colors": 2},
        "individual_activity_stimulation": {"label": "Активность и стимуляция", "min": 1, "max": 12, "colors": 2},
        "universal_independence": {"label": "Независимость", "min": 1, "max": 12, "colors": 2},
        "universal_moral_orientation": {"label": "Моральная ориентация", "min": 1, "max": 12, "colors": 2},
        "universal_tolerance": {"label": "Толерантность", "min": 1, "max": 12, "colors": 2},
        "universal_spiritual": {"label": "Духовность", "min": 1, "max": 12, "colors": 2}
      },
      "groups": [
        {
          "title": "Ценности",
          "description": null,
          "measures": [
            "family_safety",
            "family_traditions",
            "family_interpersonal_relations",
            "family_normative_conformity",
            "individual_achievement",
            "individual_power_influence",
            "individual_hedonism",
            "individual_activity_stimulation",
            "universal_independence",
            "universal_moral_orientation",
            "universal_tolerance",
            "universal_spiritual"
          ]
        }
      ]
    },
    "hardiness_leontiev_rasskazova_45@1.0.0-staging": {
      "title": "Жизнестойкость",
      "summary_position": "top",
      "level_templates": {
        "three": {"низкий": "", "средний": "", "высокий": ""}
      },
      "measures": {
        "commitment": {"min": 0, "max": 54, "colors": 3, "level_template": "three"},
        "control": {"min": 0, "max": 51, "colors": 3, "level_template": "three"},
        "challenge": {"min": 0, "max": 30, "colors": 3, "level_template": "three"},
        "total_hardiness": {"label": "Общий балл", "min": 0, "max": 135, "colors": 3, "level_template": "three"}
      },
      "groups": [
        {
          "title": "Шкалы жизнестойкости",
          "description": null,
          "measures": ["commitment", "control", "challenge"]
        }
      ],
      "summary": {
        "title": "Общий уровень жизнестойкости",
        "measures": ["total_hardiness"],
        "level_code": "total_hardiness",
        "colors": 3,
        "levels_order": ["низкий", "средний", "высокий"]
      }
    },
    "uvlk_shipilov@1.0.0-staging": {
      "title": "Уровень внутриличностной конфликтности",
      "palette": "negative",
      "measures": {
        "motivational_sphere": {
          "min": 0,
          "max": 54,
          "colors": 2,
          "description": "Переживания при выборе между желаниями, столкновении желания с обязанностью или невозможности получить желаемое."
        },
        "obligation_sphere": {
          "min": 0,
          "max": 54,
          "colors": 2,
          "description": "Переживания, когда обязанности, ожидания и правила вступают в противоречие друг с другом или с обстоятельствами."
        },
        "self_esteem_sphere": {
          "min": 0,
          "max": 54,
          "colors": 2,
          "description": "Переживания в ситуациях, когда желаемое не удаётся, трудно приспособиться к обстоятельствам или результат расходится с ожиданиями."
        },
        "motivational": {
          "min": 0,
          "max": 18,
          "colors": 2,
          "description": "Переживания при выборе между привлекательными возможностями или между желаемым и возможными последствиями."
        },
        "moral": {
          "min": 0,
          "max": 18,
          "colors": 2,
          "description": "Переживания, когда хочется поступить одним образом, а правила или обязанности требуют другого."
        },
        "unrealized_desire": {
          "min": 0,
          "max": 18,
          "colors": 2,
          "description": "Переживания, когда обстоятельства или собственные ограничения мешают получить желаемое."
        },
        "role": {
          "min": 0,
          "max": 18,
          "colors": 2,
          "description": "Переживания, когда сложно одновременно выполнить разные обязательства, например перед близкими и по работе."
        },
        "adaptation": {
          "min": 0,
          "max": 18,
          "colors": 2,
          "description": "Переживания в ситуациях, когда трудно приспособиться к обстоятельствам или отреагировать так, как хотелось бы."
        },
        "inadequate_self_esteem": {
          "min": 0,
          "max": 18,
          "colors": 2,
          "description": "Переживания, когда исход ситуации расходится с ожиданиями о своих возможностях или о поддержке других."
        },
        "total": {
          "label": "Общий балл",
          "min": 0,
          "max": 108,
          "colors": 5
        }
      },
      "groups": [
        {
          "title": "Сферы",
          "description": null,
          "measures": [
            "motivational_sphere",
            "obligation_sphere",
            "self_esteem_sphere"
          ]
        },
        {
          "title": "Типы конфликтов",
          "description": null,
          "measures": [
            "motivational",
            "moral",
            "unrealized_desire",
            "role",
            "adaptation",
            "inadequate_self_esteem"
          ]
        }
      ],
      "summary": {
        "title": "Общий уровень внутриличностной конфликтности",
        "measures": [
          "total"
        ],
        "level_code": "total",
        "colors": 5,
        "levels": {
          "крайне низкий": "В целом по вашим ответам переживания в предложенных ситуациях выражены очень слабо.",
          "низкий": "В целом по вашим ответам переживания в предложенных ситуациях выражены слабо.",
          "средний": "В целом по вашим ответам переживания в предложенных ситуациях выражены умеренно.",
          "высокий": "В целом по вашим ответам переживания в предложенных ситуациях выражены сильно.",
          "очень высокий": "В целом по вашим ответам переживания в предложенных ситуациях выражены очень сильно."
        },
        "levels_order": [
          "крайне низкий",
          "низкий",
          "средний",
          "высокий",
          "очень высокий"
        ]
      }
    }
  }
};

function textFor(view: MethodView, source: {levels?: LevelTable; level_template?: string}, level: string): string | null {
  const direct = source.levels?.[level];
  if (typeof direct === "string" && direct) return direct;
  const template = source.level_template ? view.level_templates?.[source.level_template] : undefined;
  const text = template?.[level];
  return typeof text === "string" && text ? text : null;
}

export function buildPresentation(methodVersionId: string, measures: readonly MeasureInput[], levels: ReadonlyMap<string, {value: string}>): PresentationView | null {
  const view = catalog.methods[methodVersionId];
  if (!view) return null;
  const byCode = new Map(measures.map(measure => [measure.code, measure]));
  const enrich = (code: string): PresentedMeasure | null => {
    const measure = byCode.get(code);
    if (!measure) return null;
    const meta = view.measures[code];
    const raw = levels.get(meta?.level_code || code)?.value;
    const level = raw ? normalizeLevel(raw) : "";
    const order = meta?.level_template ? Object.keys(view.level_templates?.[meta.level_template] ?? {}) : Object.keys(meta?.levels ?? {});
    const levelIndex = level ? order.indexOf(level) : -1;
    return {
      code: measure.code,
      label: meta?.label || measure.label,
      value: measure.value,
      min: typeof meta?.min === "number" ? meta.min : null,
      max: typeof meta?.max === "number" ? meta.max : null,
      colors: meta && Number.isInteger(meta.colors) ? meta.colors : 2,
      description: typeof meta?.description === "string" && meta.description ? meta.description : null,
      level: level || null,
      level_index: levelIndex,
      level_text: level ? textFor(view, meta ?? {}, level) : null
    };
  };
  const groups = view.groups.map(group => ({
    title: group.title,
    description: typeof group.description === "string" ? group.description : null,
    measures: group.measures.map(enrich).filter((measure): measure is PresentedMeasure => measure !== null)
  })).filter(group => group.measures.length);
  let summary: PresentedSummary | null = null;
  if (view.summary) {
    const meta = view.summary;
    const raw = levels.get(meta.level_code)?.value;
    const value = raw ? normalizeLevel(raw) : "";
    const order = meta.levels_order ?? [];
    summary = {
      title: meta.title,
      colors: Number.isInteger(meta.colors) ? meta.colors : 2,
      measures: meta.measures.map(enrich).filter((measure): measure is PresentedMeasure => measure !== null),
      level: value ? {code: meta.level_code, value, text: textFor(view, meta, value), index: order.indexOf(value), count: order.length} : null
    };
    const summaryLevel = summary.level;
    if (summaryLevel) {
      const matched = summary.measures.find(measure => measure.code === summaryLevel.code);
      if (matched) {
        matched.level_index = summaryLevel.index;
        if (!matched.level_text) matched.level_text = summaryLevel.text;
      }
    }
  }
  return {method_version_id: methodVersionId, title: view.title, note: typeof view.note === "string" && view.note ? view.note : null, item_count: typeof view.item_count === "number" ? view.item_count : null, item_unit: typeof view.item_unit === "string" && view.item_unit ? view.item_unit : null, palette: view.palette === "negative" ? "negative" : "positive", summary_position: view.summary_position === "bottom" ? "bottom" : "top", groups, summary};
}
export function presentationMeasureBounds(methodVersionId: string, code: string): {min: number; max: number} | null {
  const meta = catalog.methods[methodVersionId]?.measures[code];
  return meta ? {min: meta.min, max: meta.max} : null;
}
