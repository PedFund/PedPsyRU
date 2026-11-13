# Email delivery: Selectel Mail

Статус: **фундамент, выключен по умолчанию**. В этом изменении добавлены только SMTP-транспорт и проверка конфигурации; outbox-воркер, подтверждение регистрации, сброс пароля и напоминания подключаются отдельными PR. Пока `PEDPSY_MAIL_ENABLED` не равен `1`, приложение не открывает SMTP-соединений.

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
```

`PEDPSY_MAIL_ALLOWLIST` — предохранитель на время первого теста: если он задан, реальная отправка разрешена только на перечисленные адреса. После проверки allowlist убирается отдельным решением.

Проверка конфигурации fail-closed:

- без `PEDPSY_MAIL_ENABLED=1` любые `PEDPSY_SMTP_*`/`PEDPSY_MAIL_*` считаются ошибкой;
- без `PEDPSY_PILOT_REAL_EMAIL=1` включение почты отклоняется (`MAIL_REAL_EMAIL_REQUIRED`);
- порт, отличный от `1127`/`465`, неверный адрес, пустой логин/пароль или пустой элемент allowlist останавливают старт с `MAIL_CONFIG_INVALID`;
- секреты не логируются и не попадают в ошибки.

## 4. Что уже проверено

- Локальный fake-SMTP: `AUTH LOGIN`, `MAIL FROM`, `RCPT TO`, `DATA`, UTF-8 subject/body в base64, отсутствие пароля в ошибках;
- негативные сценарии: неверный адрес, CRLF-инъекция в subject/from name, ошибка аутентификации, недоступный SMTP;
- конфигурация: default disabled, Selectel defaults, allowlist, fail-closed.

## 5. Что ещё не сделано

- Outbox-воркер `contact_confirmation_outbox` и реальная отправка кода подтверждения.
- UI-сценарий «код пришёл письмом» вместо synthetic-receipt.
- Сброс пароля по email.
- Реальные напоминания исследователя (`research_reminder_outbox`).
- Проверка доставки на настоящий ящик после Verified-домена.

До появления воркера `PEDPSY_MAIL_ENABLED=1` не отправляет письма: это только транспорт и конфигурация. Включать реальную отправку до готовности домена/ящика и отдельного PR с воркером не нужно.
