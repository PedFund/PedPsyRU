# Фаза4 — конструктор исследований

04а в разработке: fixed server UUID/draft/demo, собственное membership и design_version0; metadata-only snapshot. Append-only011, приватные helpers/PUBLIC revoke, ограниченный runtime получает только create/read. Staff обеих ролей глобально читает дизайн, не меняет его; researcher читает только active own membership. Квота1 относится к **активным**, не черновым исследованиям; активация/enforcement —04е. Технический предел500 исследований на researcher предотвращает неограниченный список, не дает увеличения active quota.

Credential UPDATE →user/session locks →study →membership; повторная wall-clock identity после ожидания и перед mandatory metadata audit. Никаких raw answers/results, participant creation, методического редактора, новых прав или Selectel. Scientific core/form/key и прежние migrations001–010 не меняются. Проверки фактического PostgreSQL —CI, не локальная имитация. Пока нет приемки/merge и UI конструктора; текущий статус —STATUS.
