# МетодТест

Платформа для организации и анализа психолого-педагогических исследований. Исследователь создает группы, этапы и назначения. Участник проходит назначенные методики. Сервер сохраняет ответы и рассчитывает результаты по закрепленной версии выпуска.

Стек: Node.js 22.17.1 или новее, TypeScript, Fastify, PostgreSQL. CI проверяет Node.js 22 и 24. Прежний учебный SQLite-контур сохранен отдельно.

## Запуск и проверки

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run build
npm run start:platform:ui
```

Интерфейс откроется на `http://127.0.0.1:4175/workspace`. Это просмотр без БД: операции хранения возвращают 503. Для отдельной синтетической PostgreSQL используйте [LOCAL_DEMO.md](docs/development/LOCAL_DEMO.md) и `npm run start:platform:demo` (порт 4174). `npm start` запускает прежний учебный пилот на порту 4173.

```sh
npm run typecheck
npm run check:architecture
npm run check:syntax
npm run check:dependencies
npm test
```

PostgreSQL и браузерные проверки выполняются в CI по [.github/workflows/ci.yml](.github/workflows/ci.yml). Локальный `npm run test:pg` требует явно выделенной синтетической БД. Не направляйте тесты на рабочую БД. Проверяйте CI точного SHA, включая PostgreSQL, браузерные повторы, зависимости и секреты.

## Конфигурация

Значения секретов хранятся вне Git. Для просмотра интерфейса подключение БД не требуется. Полная конфигурация рабочего приложения описана в [runbook](docs/PRODUCTION_RUNBOOK.md), почта – в [EMAIL_DELIVERY.md](docs/EMAIL_DELIVERY.md).

| Переменные | Назначение |
|---|---|
| `PEDPSY_ENV`, `PEDPSY_PUBLIC_ORIGIN`, `HOST`, `PORT` | Режим приложения, публичный origin и адрес прослушивания |
| `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD` | Подключение к выделенной PostgreSQL |
| `PGSSL`, `PEDPSY_PG_CA_CERT`, `PEDPSY_DB_POOL` | Проверка TLS и размер пула |
| `PEDPSY_MFA_KEY`, `PEDPSY_CONTACT_KEY` | Раздельные ключи защиты MFA и контактов |
| `PEDPSY_CONTACT_DEMO`, `PEDPSY_PILOT_REAL_EMAIL` | Явное включение соответствующего регистрационного контура; условия указаны в runbook и документации почты |
| `PEDPSY_MAIL_ENABLED` и SMTP-параметры | Почтовая доставка по EMAIL_DELIVERY.md |

Имена переменных не дают разрешения включать реальные данные или отправку писем. Конфигурация локального стенда и производственного режима различается; не копируйте примеры без проверки выбранного контура.

## Деплой и восстановление

Целевая инфраструктура приложения и рабочей PostgreSQL – Selectel. Сведения о ранее проверенном стенде находятся в [CURRENT_STATE.md](CURRENT_STATE.md); они не подтверждают его текущее состояние. В интегрированной CI-конфигурации нет задания автоматического production-деплоя. Открытые PR по доставке не считаются действующим механизмом.

Порядок выпуска: проверенный SHA с успешным CI → резервная копия и проверка восстановления → согласованные append-only миграции отдельной ролью → сборка и перезапуск приложения → проверка здоровья и пользовательского сценария. Детали – [PRODUCTION_RUNBOOK.md](docs/PRODUCTION_RUNBOOK.md) и [LAUNCH_READINESS.md](docs/LAUNCH_READINESS.md). Откат приложения требует совместимости с текущей схемой БД; миграции не откатываются удалением файлов.

Merge и производственный деплой требуют отдельных разрешений владельца. Техническая готовность не означает научного допуска или права на сбор реальных данных.

## Документы

- [CURRENT_STATE.md](CURRENT_STATE.md) – контрольная точка и открытые вопросы; фактические Git/CI проверяются отдельно.
- [AGENTS.md](AGENTS.md), [agent-instructions/](agent-instructions) – действующие инструкции агентам.
- [ARCHITECTURE.md](docs/architecture/ARCHITECTURE.md), [модель данных](docs/architecture/ARCHITECTURE.md#данные-и-воспроизводимость), [STORAGE_CONTRACT.md](docs/architecture/STORAGE_CONTRACT.md), [ACCESS_POLICY.md](docs/architecture/ACCESS_POLICY.md) – устройство, хранение и доступ.
- [methods/README.md](methods/README.md) – библиотека, источники, версии и подключение методик.
- [Утвержденная спецификация восьми методик](docs/APPROVED_EIGHT_METHODS_SPEC_2026-11-23.md) – каноническое содержательное решение владельца.
- [METHOD_EXTENSION_CONTRACT.md](docs/methods/METHOD_EXTENSION_CONTRACT.md) – расширение обычными и нестандартными методиками через проверенный код.
- [docs/security/README.md](docs/security/README.md) – безопасность и зафиксированные пробелы.
- [ROADMAP.md](docs/product/ROADMAP.md) – продуктовые цели; актуальные задачи и обсуждения ведутся в GitHub Issues/PR.

История разработки доступна в Git и PR. Промежуточные отчеты не нужно возвращать в рабочее дерево. Происхождение текста, ключей и нормативов сохраняется в закрепленных пакетах методик.

Закрепленные формы, ключи, нормы, обработчики, манифесты, миграции и исторические результаты неизменяемы. Исправление выпуска оформляется новой версией. Наличие архивных материалов не разрешает их исполнение или публикацию.

В корне остаются README, AGENTS, CURRENT_STATE и обязательные THIRD_PARTY_NOTICES, а также используемые кодом файлы и конфигурация. Профильные материалы находятся в `docs/architecture`, `docs/methods`, `docs/product`, `docs/development`, `docs/security` и `docs/performance`. Исторические отчеты доступны в Git; их не нужно возвращать в корень.
