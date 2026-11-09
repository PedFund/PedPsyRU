# Production runbook: Selectel

Статус: **черновик к переносу**. Он не заменяет юридическую, научную и security-приёмку.
До отдельного go/no-go разрешены только synthetic-данные; реальные ФИО, email и ответы не переносить.

## 1. Что должно быть готово до вечера

- Selectel VM (Ubuntu 24.04, Node.js 22/24) и PostgreSQL 18.6: managed-сервис или отдельный сервер в private network.
- PostgreSQL **не** опубликован в интернет; приложение подключается по внутреннему адресу и TLS.
- DNS-запись приложения, TLS-сертификат, reverse proxy (Nginx/Caddy), firewall.
- Secret storage: `PEDPSY_MFA_KEY`, `PEDPSY_CONTACT_KEY`, `PGPASSWORD`; значения не в Git и не в переписке.
- Проверенная сборка из тега `main` с зелёным CI; никаких правок кода на сервере.
- Резервная копия/restore-проверка до миграций и после; `pg_dump`/`pg_restore` или managed PITR.

## 2. Переменные приложения

```text
PEDPSY_ENV=production
PEDPSY_PUBLIC_ORIGIN=https://research.example.org
HOST=127.0.0.1
PORT=4174
PGHOST=<private-db-host>
PGPORT=5432
PGDATABASE=<production-db>
PGUSER=pedpsy_runtime_<16hex>
PGPASSWORD=<secret>
PGSSL=verify-full
# PEDPSY_PG_CA_CERT=/etc/pedpsy/selectel-pg-ca.pem
PEDPSY_DB_POOL=8
PEDPSY_MFA_KEY=<base64 32 bytes>
PEDPSY_CONTACT_KEY=<base64 32 bytes, distinct>
PEDPSY_CONTACT_DEMO=1
```

`PEDPSY_CONTACT_DEMO=1` означает только учебную регистрацию `@example.test`; настоящая почта и юридические тексты ещё не реализованы. Без него registration routes отвечают 503, что допустимо для закрытого контура без новых регистраций.

## 3. Сборка и миграции

```bash
git checkout <verified-release-tag>
npm ci --ignore-scripts --no-audit --no-fund
npm run build
npm run typecheck
```

Чистая БД, отдельный owner/migration role:

```bash
PGHOST=... PGPORT=5432 PGDATABASE=... PGUSER=<owner> PGPASSWORD=... PGSSL=verify-full \
PEDPSY_RUNTIME_ROLE=pedpsy_runtime_<16hex> PEDPSY_MIGRATION_CONFIRM=<production-db> \
node scripts/migrate-production.js
```

Скрипт применяет append-only миграции `storage/postgres/001..NNN` и выдаёт runtime-роли только разрешённые grants. Он не создаёт demo-данные и не импортирует локальную БД. Перед запуском — backup; после — `pg_dump`/restore rehearsal.

## 3a. Synthetic staging (только стенд, не production)

Для вечернего закрытого стенда с synthetic-данными и первым staff-входом:

```bash
PGHOST=... PGPORT=5432 PGDATABASE=... PGUSER=<owner> PGPASSWORD=... PGSSL=verify-full \
PEDPSY_RUNTIME_ROLE=pedpsy_runtime_<16hex> PEDPSY_STAGING_CONFIRM=<staging-db> \
node scripts/prepare-staging-database.js
```

Скрипт применяет миграции, импортирует **synthetic snapshot** (учебные исследования/методики, без credentials) и создаёт одного `PEDPSY-OWNER` с одноразовым паролем. Пароль печатается только в интерактивном TTY; сохраните его и завершите MFA. Это **не production**: реальные данные, реальная почта и юридические тексты запрещены.

Если seed уже применён, а admin не создан, повторный запуск с `PEDPSY_STAGING_ADMIN_ONLY=1` создаёт только admin.

Для **production clean** этот скрипт не использовать: нужен отдельный утверждённый импорт методик и production-процедура первого администратора; сейчас автоматизирован только staging-путь.

## 4. Запуск приложения

Systemd unit (пример; путь и пользователь заменить):

```ini
[Unit]
Description=MetodTest
After=network.target

[Service]
Type=simple
User=pedpsy
WorkingDirectory=/opt/pedpsy
EnvironmentFile=/etc/pedpsy/app.env
ExecStart=/usr/bin/node /opt/pedpsy/dist/src/bootstrap/postgres-server.js
Restart=on-failure
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

Nginx: TLS termination, `proxy_set_header Host $host`, `X-Forwarded-Proto https`, `client_max_body_size 1m`, HSTS, deny access to `.local`, `/etc`, backups. Приложение слушает `127.0.0.1:4174`; наружу — только 443.

## 5. Smoke после запуска

1. `GET /health` → `{"status":"ok"}`.
2. Staff login + MFA; researcher invite/accept/login.
3. Участник: групповая ссылка → паспортичка → согласия → TKI 30 вопросов → reload → результат с уровнями.
4. Проверить secure cookies (`__Host-...`), отсутствие ответов в логах, аудит.
5. Backup/restore: восстановить копию в отдельную БД, сверить количество строк и доступ.

## 6. Rollback

- Остановить приложение, вернуть предыдущий release-каталог/тег.
- Миграции не откатывать вручную; они append-only. При несовместимости — restore из проверенной копии и отдельное решение.
- Сохранить логи и аудит; не удалять БД и не переписывать историю.

## 7. Что блокирует real data

- Юридический оператор, политика, согласия, retention, 152-ФЗ/локализация, DPA, инциденты.
- Научно-этическое одобрение и утверждённый production-набор методик/версий/норм.
- Реальная почта/домен/SPF/DKIM/DMARC и замена `@example.test`.
- Backup/PITR, monitoring/alerts, on-call, access review, security review.
- Отдельное письменное разрешение владельца на real data.
- Production-импорт утверждённой библиотеки методик и процедура первого администратора (staging-скрипт для этого не подходит).

До этих пунктов Selectel-контур считается **staging/demo с synthetic-данными**.
