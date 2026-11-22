# k6 — нагрузочные сценарии МетодТест

Набор протокольных (HTTP) сценариев Grafana k6 для проверки регистрации, входа,
прохождения методик, конкурентных операций и смешанной нагрузки.

**k6:** v2.4.0 (требуется ≥ 2.0.0).
**Целевой контур:** только изолированный стенд. Рабочий сайт `mettest.vibemind.pro`
запрещён: `lib/common.js` содержит safety-gate `assertSafeTarget()`, который
отказывается запускать сценарий против production-хоста и любого не-loopback
адреса без `ALLOW_NON_LOCAL=1`.

---

## 1. Состав

| Файл | Назначение | Executor |
|---|---|---|
| `smoke.js` | функциональная проверка: health, вход, сессия, форма, сохранение | per-vu-iterations |
| `registration.js` | сценарий A: массовая регистрация (20/50/100/200) | shared-iterations |
| `login.js` | сценарий B: одновременный вход 200 аккаунтов | per-vu-iterations |
| `exam.js` | сценарий C: прохождение с реалистичным темпом ответов | ramping-vus |
| `stress.js` | нагрузка выше расчётной (короткий think time) | ramping-vus |
| `spike.js` | резкий всплеск: 300 участников за 30 с | ramping-vus |
| `soak.js` | длительная непрерывная работа | ramping-vus |
| `breakpoint.js` | предел по интенсивности сохранений | ramping-arrival-rate + abortOnFail |
| `conflict.js` | сценарий D: гонка, повтор, второе устройство | per-vu-iterations |
| `completion.js` | завершение попытки и проверка результата | per-vu-iterations |
| `mixed.js` | сценарий E: регистрация + вход + прохождение одновременно | shared/ramping |
| `lib/common.js` | safety-gate, сессии, cookie, csrf, вход | — |
| `lib/exam-scenario.js` | общая итерация прохождения | — |
| `data/accounts.json` | 236 синтетических аккаунтов (`@example.test`) | — |
| `data/attempts.json` | 708 синтетических попыток (по 3 на аккаунт) | — |

Данные содержат только синтетические адреса и пароли стенда. Реальных
персональных данных, токенов и секретов в каталоге нет.

---

## 2. Переменные окружения

| Переменная | По умолчанию | Смысл |
|---|---|---|
| `BASE_URL` | `http://127.0.0.1:4174` | адрес изолированного стенда |
| `VUS` | зависит от сценария | число виртуальных пользователей |
| `RAMP` / `HOLD` | 5m / 15m | разгон и удержание |
| `THINK_MIN` / `THINK_MAX` | 5 / 10 | пауза между ответами, с |
| `OFFSET` | 0 | сдвиг по списку аккаунтов/попыток |
| `INVITE_TOKEN` | — | токен синтетического приглашения стенда |
| `RUN_ID` | timestamp | уникальный префикс email для регистрации |
| `ALLOW_NON_LOCAL` | — | `1` разрешает не-loopback стенд (production всё равно запрещён) |

---

## 3. Порядок запуска

```powershell
$env:BASE_URL = 'http://127.0.0.1:4174'
$env:INVITE_TOKEN = '<invite из audit/stand/invite.json>'

# 1. Smoke обязателен: без зелёного smoke нагрузку не запускать
k6 run loadtest/k6/smoke.js

# 2. Вход 200
$env:VUS='200'; k6 run --summary-export=..\audit\results\login-200.json loadtest/k6/login.js

# 3. Регистрация
$env:VUS='200'; $env:RUN_ID='r200'; k6 run --summary-export=..\audit\results\registration-200.json loadtest/k6/registration.js

# 4. Прохождение 300
$env:VUS='300'; $env:RAMP='1m'; $env:HOLD='15m'; k6 run --summary-export=..\audit\results\exam-300.json loadtest/k6/exam.js

# 5. Завершение (после того как на попытках сохранены все пункты)
$env:VUS='30'; k6 run --summary-export=..\audit\results\completion-30.json loadtest/k6/completion.js
```

Между независимыми прогонами на стенде очищаются bucket-ы троттлинга
(`audit/reset-throttles.sql`), чтобы стартовые условия совпадали. Сама защита
в ходе прогона не отключается.

`run-all.ps1` выполняет smoke и останавливается при его падении.

---

## 4. Пороги и метрики

Глобальные:

- `http_req_failed < 1%` (в целевом сценарии);
- сохранение ответа `p(95) < 500 мс`, `p(99) < 1500 мс`;
- `checks > 99%`;
- вход `p(95) < 30 000 мс` (на время действия текущего ограничения scrypt-очереди);
- регистрация: `RegistrationStart p(95) < 15 000 мс`, `Receipt/Confirm p(95) < 2 000 мс`.

Дополнительные счётчики: `login_throttled`, `registration_throttled`,
`draft_revision_conflict`, `draft_rejected`, `attempts_scored`,
`attempts_incomplete`, `unexpected_server_errors`.

`429` и `409` — ожидаемые отказы по правилам доступа и версионирования; они
учитываются отдельно и не смешиваются с техническими 5xx.

---

## 5. Проверка целостности

После прогона (только на изолированной БД):

```sql
-- дубли ответов «попытка + пункт»
SELECT count(*) FROM (SELECT attempt_id,item_id FROM pedpsy.responses GROUP BY 1,2 HAVING count(*)>1) q;
-- ответы без попытки
SELECT count(*) FROM pedpsy.responses r WHERE NOT EXISTS (SELECT 1 FROM pedpsy.attempts a WHERE a.id=r.attempt_id AND a.study_id=r.study_id AND a.release_id=r.release_id);
-- ответы на пункт вне release
SELECT count(*) FROM pedpsy.responses r WHERE NOT EXISTS (SELECT 1 FROM pedpsy.release_items i WHERE i.release_id=r.release_id AND i.item_id=r.item_id);
-- завершённые без результата и двойные результаты
SELECT count(*) FROM pedpsy.attempts a WHERE a.status='completed' AND NOT EXISTS (SELECT 1 FROM pedpsy.attempt_results x WHERE x.attempt_id=a.id);
SELECT count(*) FROM (SELECT attempt_id FROM pedpsy.attempt_results GROUP BY 1 HAVING count(*)>1) q;
```

Полный набор — `audit/integrity.sql`. Успешный HTTP-ответ не считается
доказательством сохранности: обязательна сверка с БД.

---

## 6. Оговорки

- Windows-стенд: антивирус и файловая система завышают задержки записи; k6
  делит CPU с приложением. Для приёмки нужен Linux-стенд, сопоставимый с
  Selectel (2 vCPU / 4 ГБ).
- Пул приложения на demo-стенде — 4, на проде — 8.
- В тестовой БД 1 440 попыток против 245 на проде: это усиливает дефект
  RLS-скана и делает задержки стенда пессимистичными.
- Перед прогоном проверяется адрес (`assertSafeTarget`) и отдельная БД; массовые
  испытания на рабочем контуре запрещены.
