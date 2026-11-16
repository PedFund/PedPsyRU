# Email delivery: Selectel Mail

Статус: **транспорт и подтверждение регистрации готовы, выключены по умолчанию**. Пока `PEDPSY_MAIL_ENABLED` не равен `1`, приложение не открывает SMTP-соединений и не запускает outbox-воркер. Сброс пароля и реальные напоминания подключаются отдельными PR.

## 1. Что нужно в панели Selectel

1. Подключить **Почтовый сервис Selectel** к домену, который вы контролируете. Домен должен получить статус **Verified**: панель → **Продукты** → **Почтовый сервис** → ресурс → **Информация** → **Привязанные домены**.
2. Создать почтовый ящик/ресурс и получить:
   - SMTP-логин;
   - SMTP-пароль;
   - адрес отправителя на verified-домене, например `noreply@example.ru`.
3. Настроить DNS так, как требует панель Selectel: SPF, DKIM и DMARC. Без этого письма будут попадать в спам или отклоняться.
4. Проверить, что домен и ящик действительно готовы: отправить тестовое письмо из панели или через `swaks`/`openssl s_client`.

Важно: домен вида `mettest.87-228-83-218.sslip.io` нельзя верифицировать в Selectel Mail, потому что DNS-зоной `sslip.io` вы не управляете. Для отправителя нужен собственный домен. Адрес приложения при этом может оставаться прежним; ссылка в письме будет вести на `PEDPSY_PUBLIC_ORIGIN`.

## 2. SMTP-параметры

Selectel Mail:

- хост: `smtp.mail.selcloud.ru`;
- порт `1127` — TLS (SSL), используется по умолчанию;
- порт `1126` — без SSL/STARTTLS; **не поддерживается** этим транспортом и отклоняется конфигурацией;
- аутентификация: `AUTH LOGIN`;
- отправитель: адрес на verified-домене.

Транспорт использует встроенные `node:net`/`node:tls`, новых npm-зависимостей нет. Сертификат проверяется, `rejectUnauthorized` не отключается.

Selectel добавляет к письмам служебные заголовки `Precedence: bulk`, `X-MSG-TYPE: bulk` и `List-Unsubscribe`. Транспорт передаёт собственный `Precedence: transaction`, чтобы транзакционные подтверждения не помечались как массовая рассылка. `List-Unsubscribe` и `X-MSG-TYPE: bulk` полностью убираются только платной услугой «Выделенный сендер»; при жалобах на спам это следующий шаг.

## 3. Переменные

Добавлять в `/etc/mettest/app.env` (не в Git и не в переписку):

```text
PEDPSY_MAIL_ENABLED=1
PEDPSY_PILOT_REAL_EMAIL=1
PEDPSY_SMTP_HOST=smtp.mail.selcloud.ru
PEDPSY_SMTP_PORT=1127
PEDPSY_SMTP_USER=<smtp-login>
PEDPSY_SMTP_PASSWORD=<smtp-password>
PEDPSY_MAIL_FROM=noreply@example.ru
PEDPSY_MAIL_FROM_NAME=МетодТест
# необязательно:
# PEDPSY_MAIL_REPLY_TO=support@example.ru
# PEDPSY_MAIL_ALLOWLIST=owner@example.ru
# PEDPSY_MAIL_BATCH=10
# PEDPSY_MAIL_POLL_MS=2000
# PEDPSY_MAIL_RATE_LIMIT=20
# PEDPSY_MAIL_RATE_WINDOW_MS=300000
```

`PEDPSY_MAIL_ALLOWLIST` — предохранитель на время первого теста: если он задан, реальная отправка разрешена только на перечисленные адреса. После проверки allowlist убирается отдельным решением.

`PEDPSY_MAIL_RATE_LIMIT` / `PEDPSY_MAIL_RATE_WINDOW_MS` — локальный предохранитель под лимит Selectel. По умолчанию **20 писем / 5 минут**. Если Selectel поднял лимит по тикету, увеличьте оба значения; если не поднял — 200 подтверждений будут уходить примерно **50 минут**.

Проверка конфигурации fail-closed:

- без `PEDPSY_MAIL_ENABLED=1` любые `PEDPSY_SMTP_*`/`PEDPSY_MAIL_*` считаются ошибкой;
- без `PEDPSY_PILOT_REAL_EMAIL=1` включение почты отклоняется (`MAIL_REAL_EMAIL_REQUIRED`);
- порт, отличный от `1127`/`465`, неверный адрес, пустой логин/пароль или пустой элемент allowlist останавливают старт с `MAIL_CONFIG_INVALID`;
- секреты не логируются и не попадают в ошибки.

## 4. Как работает подтверждение

1. Участник отправляет форму регистрации; `queue_registration_confirmation` создаёт строку `contact_confirmation_outbox` с зашифрованным одноразовым кодом.
2. Воркер раз в `PEDPSY_MAIL_POLL_MS` забирает не больше `PEDPSY_MAIL_BATCH` строк через `claim_registration_confirmations` (`FOR UPDATE SKIP LOCKED`).
3. Код расшифровывается тем же contact key, что и synthetic-receipt, и отправляется письмом: тема, название исследования/группы, код, срок действия, ссылка на платформу.
4. Участник возвращается на исходную групповую ссылку в том же браузере и вводит код в поле «Код из письма».
5. Успех/неудача фиксируются в `access_audit_events` (`participants.registration.email`, fixed reason code) без email и кода.
6. При ошибке SMTP — backoff до 1 часа, не более 10 попыток; просроченные и исчерпанные строки помечаются `failed` фоновой зачисткой.
7. В mail-режиме synthetic-receipt выключен: код нельзя получить из браузера, только из письма.

Доставка **at-least-once**: при падении между отправкой и отметкой `sent` письмо с тем же кодом может прийти повторно. Это безопаснее, чем потерять код; новый код не создаётся.

## 5. Что уже проверено

- Локальный fake-SMTP: `AUTH LOGIN`, `MAIL FROM`, `RCPT TO`, `DATA`, UTF-8 subject/body в base64, отсутствие пароля в ошибках;
- негативные сценарии: неверный адрес, CRLF-инъекция в subject/from name, ошибка аутентификации, недоступный SMTP;
- конфигурация: default disabled, Selectel defaults, allowlist, rate limit, fail-closed;
- PostgreSQL: claim/finish/stale-sweep, успешная отправка, allowlist, SMTP-сбой, истёкший код, аудит без кода/email;
- UI: mail-режим показывает поле для кода и не показывает synthetic-receipt.

## 6. Что ещё не сделано

- Сброс пароля по email.
- Реальные напоминания исследователя (`research_reminder_outbox`).
- Проверка доставки на настоящий ящик после Verified-домена.
- Снятие Selectel-инцидента и фактическое включение `PEDPSY_MAIL_ENABLED=1` на стенде.
- Тикет на повышение лимита 20/5мин, если письма нужны быстрее 50 минут.
