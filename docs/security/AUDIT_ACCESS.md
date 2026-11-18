# Аудит: управление доступом и RLS

Дата: 2026-11-18. База: `main` `5522d0c`. Метод: программный разбор схемы и каталога функций (RLS, политики, гранты, SECURITY DEFINER) плюс чтение ключевых SQL-функций. Динамическое тестирование (IDOR-фаззинг) не выполнялось. Связанные документы: [THREAT_MODEL.md](THREAT_MODEL.md) (Т-03, Т-04), [AUDIT_AUTH.md](AUDIT_AUTH.md), [CONTROLS_MATRIX.md](CONTROLS_MATRIX.md) (УПД.2, УПД.4, УПД.5).

## 1. Подтверждённые свойства (с числами)

| Свойство | Значение | Как проверено |
|---|---|---|
| Таблиц с включённым RLS | **40** | `pg_class.relrowsecurity` |
| Таблиц без RLS | **21** | там же; перечень ниже |
| RLS-политик | **10**, все с проверкой владения/скоупа | `pg_policies.qual / with_check`: `can_read_attempt`, `owns_active_attempt`, `can_read_release` |
| SECURITY DEFINER без фиксированного `search_path` | **0** | `pg_proc.proconfig` |
| SECURITY DEFINER с динамическим SQL (`EXECUTE format(...)`) | **0** | `pg_proc.prosrc` |
| Таблиц, выданных runtime-роли | **7** | `information_schema.role_table_grants` |
| Функций, выданных runtime-роли | **99** | `role_routine_grants` |
| Триггеров (immutability/CAS/guard) | **45** | `pg_trigger` |
| Ссылок на проверку членства в исследовании | 23 | `study_memberships` в телах функций |

Модель доступа — **deny-by-default**: у runtime-роли нет прав на таблицы с ПДн; доступ идёт только через `SECURITY DEFINER`-функции с фиксированным `search_path`. RLS включён и на тех таблицах, где политик нет: без политики и без грантов таблица доступна только владельцу схемы.

Политики participant-пути (единственные, где runtime-роль работает с таблицами напрямую):

| Таблица | Политика | Условие |
|---|---|---|
| `attempts` | read/update | `can_read_attempt(id)`, `status='draft' AND owns_active_attempt(id)` |
| `responses` | read/insert/delete | `can_read_attempt` / `owns_active_attempt` |
| `attempt_results` | read/insert | `can_read_attempt` / `owns_active_attempt` |
| `instrument_releases`, `release_items` | read | `can_read_release` |
| `access_audit_events` | insert | актор совпадает с credential/study, `resource_id` проверяется через `can_read_attempt` |

Грантов ровно на 7 таблиц: `access_audit_events` (INSERT), `attempt_results` (INSERT,SELECT), `attempts` (SELECT), `instrument_releases` (SELECT), `release_items` (SELECT), `release_presentation_corrections` (SELECT), `responses` (DELETE,INSERT,SELECT).

Исследовательские и staff-пути авторизуются через `account_actor()` и `lock_study_design()`, который проверяет роль и членство в исследовании (`011_study_constructor.sql:39-46`), а изменения дизайна — через `require_mutable_design` (`012:3`).

## 2. Находки

### A-1 — 21 таблица без RLS, включая таблицы идентичности (P3)

Без RLS: `assignments`, `login_throttles`, `participant_credentials`, `participant_sessions`, `participants`, `release_presentation_corrections`, `research_groups`, `research_stages`, `researcher_credentials`, `researcher_invites`, `researcher_sessions`, `seed_runs`, `staff_credentials`, `staff_login_challenges`, `staff_mfa_factors`, `staff_recovery_codes`, `staff_sessions`, `stage_enrollments`, `studies`, `study_memberships`, `users`.

Сегодня они защищены отсутствием грантов и определителями, но это единственный барьер: один случайный `GRANT SELECT` в будущей миграции откроет таблицу целиком.

Рекомендация: включить RLS без политик на эти таблицы (deny-by-default для не-владельца). Поведение не меняется, добавляется защита от ошибки. Отдельная миграция.

### A-2 — аудит без append-only триггера (P3)

`access_audit_events` защищён RLS и отсутствием гранта на UPDATE/DELETE, но триггера неизменяемости нет: ошибка в definer-функции или будущий грант позволит переписать историю. В остальных исторических таблицах такой триггер есть (45 триггеров).

Рекомендация: `immutable_row`-триггер на аудит, как у `research_profile_history`.

### A-3 — нет автоматического инварианта «каждая выданная функция проверяет актора» (P2)

Среди 180+ `SECURITY DEFINER`-функций **73** не ссылаются напрямую на примитивы авторизации (`session_actor`, `account_actor`, `study_memberships`, `lock_*`, `require_*`, `owns_*`, `can_read_*`). Выборочная проверка показывает, что это в основном внутренние помощники (`configure_study_group`, `finish_*_login`, `constructor_release_allowed`), вызываемые из проверяющих обёрток, — то есть дефекта не найдено. Но инвариант не зафиксирован: новая функция может быть выдана runtime-роли без проверки.

Рекомендация: CI-проверка «функция выдана runtime-роли ⇒ в теле есть примитив авторизации или она в явном allowlist», с файлом-allowlist для помощников и коротким обоснованием на каждую запись. Это переводит ручную ревизию в постоянный контроль.

### A-4 — политики RLS покрывают только participant-путь (P3, к сведению)

Для researcher/staff-пути RLS-политик нет: доступ целиком через определители. Это осознанный дизайн (минимум прав у runtime-роли), но означает, что любая ошибка в definer-функции не ограничивается RLS. Рекомендация: не добавлять гранты на таблицы ПДн; при появлении нового пути — сначала RLS-политика, потом грант.

## 3. Что не проверялось

- Динамический IDOR-фаззинг всех эндпоинтов (проверена схема и выборка функций).
- Полная ревизия 73 функций-кандидатов (выборка + логика вызовов).
- Экспортные пути staff (`staff_diagnostic_snapshot`) на предмет минимальности полей.
- Влияние будущих миграций: инвариант держится на ревью.

## 4. План

| Приоритет | Действие | Тип |
|---|---|---|
| P2 | CI-инвариант «выданная функция проверяет актора или в allowlist» | код + конфиг |
| P3 | RLS без политик на 21 таблицу + тест, что runtime-роль по-прежнему не читает их | миграция |
| P3 | append-only триггер на `access_audit_events` | миграция |
| P3 | Зафиксировать правило «сначала RLS-политика, потом грант» в `AGENTS.md`/SECURITY | docs |

Любое изменение — отдельный PR через ветку и CI; применённые миграции не переписываются.
