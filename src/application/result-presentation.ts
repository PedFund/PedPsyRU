// Participant-facing presentation for approved releases. Display data only:
// it never changes forms, keys, scoring, norms or historical results.
type LevelTable = Record<string, string>;
type MeasureMeta = {label?: string; min: number; max: number; colors: number; description?: string | null; level_template?: string; levels?: LevelTable};
type GroupMeta = {title: string; description?: string | null; measures: string[]};
type SummaryMeta = {title: string; measures: string[]; level_code: string; colors: number; level_template?: string; levels?: LevelTable; levels_order?: string[]};
type MethodView = {title: string; palette?: "positive" | "negative"; summary_position?: "top" | "bottom"; level_templates?: Record<string, LevelTable>; measures: Record<string, MeasureMeta>; groups: GroupMeta[]; summary?: SummaryMeta};
type Catalog = {schema_version: string; note?: string; methods: Record<string, MethodView>};
type MeasureInput = {code: string; label: string; value: number};
export type PresentedMeasure = {code: string; label: string; value: number; min: number | null; max: number | null; colors: number; description: string | null; level: string | null; level_index: number; level_text: string | null};
export type PresentedGroup = {title: string; description: string | null; measures: PresentedMeasure[]};
export type PresentedLevel = {code: string; value: string; text: string | null; index: number; count: number};
export type PresentedSummary = {title: string; colors: number; measures: PresentedMeasure[]; level: PresentedLevel | null};
export type PresentationView = {method_version_id: string; title: string; palette: "positive" | "negative"; summary_position: "top" | "bottom"; groups: PresentedGroup[]; summary: PresentedSummary | null};

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
    const raw = levels.get(code)?.value;
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
  return {method_version_id: methodVersionId, title: view.title, palette: view.palette === "negative" ? "negative" : "positive", summary_position: view.summary_position === "bottom" ? "bottom" : "top", groups, summary};
}
