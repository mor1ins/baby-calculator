# Запуск и доставка

## Локальная машина

Основной путь описан в [README](../README.md): Compose поднимает PostgreSQL 16, применяет Alembic и запускает FastAPI со статикой React за Nginx на `http://localhost:8080`.

Для разработки отдельно:

- Backend: `BABY_DATABASE_URL=postgresql+psycopg://… BABY_PUBLIC_ORIGIN=http://localhost:5173 make -C backend run`.
- Frontend: `cd frontend && npm ci && npm run dev`; открыть именно `http://localhost:5173`.
- Локальный HTTP — единственное окружение без `Secure` у cookie; в dev/prod cookie всегда Secure. `BABY_PUBLIC_ORIGIN` задает точный разрешенный Origin, включая порт. Не хранить пароли/токены во frontend.

Если `make run` запускается до миграций, `/ready` вернет 503. Применить `BABY_DATABASE_URL=… make -C backend migrate`. `/health` проверяет процесс, `/ready` — соединение с БД и нужную ревизию схемы.

## Один VPS, два окружения

`compose.server.yaml` запускается как два независимых Compose-проекта: `baby-dev` и `baby-prod`. У них отдельные networks и volumes, PostgreSQL не публикует порт. Frontend слушает только loopback VPS: dev — 8081, prod — 8082. Nginx на хосте завершает HTTPS и направляет домены в соответствующее окружение; API остается `/api/v1` на том же origin.

Перед внешним выпуском:

1. Выбрать VPS/домен, настроить DNS основного домена и `dev`-поддомена.
2. Установить Docker Compose, Python 3 и `flock`; создать отдельного SSH-пользователя с доступом к Docker.
3. Создать `/srv/baby/dev/.env` и `/srv/baby/prod/.env` по `server.env.example`, разные URL-safe пароли БД и порты. Файлы принадлежат серверу, в Actions не копируются.
4. Для deploy-job разрешить `packages: read`. Actions передаёт временный `GITHUB_TOKEN` через SSH stdin для входа в GHCR; `release.sh` использует временный `DOCKER_CONFIG` и удаляет его при завершении. Постоянный токен на VPS не нужен. Токен не включать в image или `.env` приложения.
5. Настроить Nginx по `edge.conf.example`, получить и настроить автоматическое обновление сертификатов ACME. Имена в примере заменить до применения. Проверить `nginx -t` и HTTPS.
6. Сохранить repository secrets `DEV_SSH_HOST`, `DEV_SSH_USER`, `DEV_SSH_KEY`, `DEV_SSH_KNOWN_HOSTS`; аналогичные `PROD_…`. Ключ сервера получить по доверенному каналу. Доставка не использует автоматическое принятие SSH-ключей.

GitHub Environments не требуются.

### Состояние VPS на 4 октября 2026

Подготовлен Selectel Rowan в Москве: `135.106.163.138`, Ubuntu 24.04 LTS, 2 vCPU, 2 ГБ RAM, 40 ГБ диска. Установлены Docker, Compose, Nginx и Certbot. UFW разрешает входящие TCP 22/80/443; для Docker настроена ротация логов (драйвер `local`, 10 МБ × 3 на контейнер).

Пользователь `baby-deploy` входит по SSH-ключу владельца и имеет доступ к Docker. В `/srv/baby/{dev,prod}` размещены `compose.yaml`, `release.sh` и отдельные `.env` с правами 0600. Регистрация отключена на фронте и бэке, допуск времени — 20 минут. Пароли БД сгенерированы отдельно для каждого окружения и хранятся только на сервере. Проверены вход по ключу и валидация Compose без запуска контейнеров.

Куплен домен `tishe-doma.ru`, для dev выбран `dev.tishe-doma.ru`; оба HTTPS origin внесены в серверные `.env`. Делегирование и A-записи проверены. На обоих доменах работает HTTPS, HTTP перенаправляется на HTTPS. Пока приложение не запущено, Nginx отдаёт страницу подготовки с HTTP 503. Dev и prod запущены через GitHub Actions, у каждого отдельная PostgreSQL. Prod начат с пустой базы; локальные данные и учётные записи не переносились.

В GitHub настроены восемь `DEV_SSH_*` / `PROD_SSH_*` secrets для `baby-deploy`: отдельный ключ Actions проверен подключением к VPS. Личный приватный ключ владельца в GitHub не передавался. Оба окружения используют один ключ доставки. SSH host key закреплён по первому подключению (TOFU); независимая сверка по доверенному каналу ещё не выполнена.

Сертификат Let’s Encrypt для обоих доменов хранится на VPS в `/etc/letsencrypt/live/tishe-doma.ru/` (`fullchain.pem`, `privkey.pem`), текущий срок — до 2 января 2027. Продление выполняет `certbot.timer`; deploy-hook `/etc/letsencrypt/renewal-hooks/deploy/reload-nginx` проверяет конфигурацию и перезагружает Nginx после продления. ACME webroot — `/var/www/acme`, конфигурация Nginx — `/etc/nginx/sites-available/baby`. Закрытый ключ сертификата в репозиторий не переносится. Проверены HTTPS обоих доменов с валидацией доверия, редиректы HTTP и пробное продление `certbot renew --dry-run --run-deploy-hooks --no-random-sleep-on-renew`: успешно, включая reload Nginx.

Доставка настроена на временную GHCR-авторизацию через токен Actions с правом `packages: read`. Первый dev-выпуск выполнен успешно: [Deploy dev #37223084510](https://github.com/mor1ins/baby-calculator/actions/runs/37223084510), commit `438f483`. Все CI-проверки прошли. На `https://dev.tishe-doma.ru` проверены readiness 200, загрузка страницы без ошибок JavaScript, Secure/HttpOnly cookie, перенаправление `/register` на `/login`, отсутствие ссылки регистрации и отказ API 403 `registration_disabled`. Допуск времени на бэкенде — 20 минут. Dev-база не содержит пользовательских аккаунтов.

Версия со скриптом `create_user.py` (commit `f0197bd`) прошла [Deploy dev #37224520675](https://github.com/mor1ins/baby-calculator/actions/runs/37224520675) и [Promote dev to prod #37224866275](https://github.com/mor1ins/baby-calculator/actions/runs/37224866275). Одинаковые digest образов dev/prod сверены на VPS. На основном сайте создан один обычный пользователь с пустым дневником; проверены вход, загрузка дневника и выход в браузере, регистрация закрыта. Пароль передан владельцу отдельно и не хранится в репозитории. Резервные копии пока не настроены.

## GitHub Actions

- `deploy-dev.yml`: main → dev автоматически; workflow_dispatch с номером PR → dev вручную. Разрешен открытый PR из этого же репозитория. Определяется точный SHA, на нем выполняются линтеры, тесты, проверка API и E2E. Только после успеха собираются и публикуются образы GHCR.
- Образы помечены SHA, доставка использует digest `@sha256:…`. После успешного dev-развертывания сохраняется artifact `dev-verified-release`.
- `deploy-prod.yml`: вручную указать ID успешного запуска Deploy dev. Artifact содержит те же digest; prod их скачивает и запускает, пересборки нет. Artifact хранится 30 дней.
- Workflow сериализованы по окружению, дополнительно сервер использует `flock`. Код доставки берется из main. Приложение из PR никогда не получает SSH-secrets на этапе проверок.
- Обычные PR также проходят независимые backend/frontend/API/E2E workflow.

GitHub проверяет source commit до публикации образов; после запуска контейнера проверяется readiness. Перед продвижением пользователь проверяет поведение конкретного dev-релиза. Публичные Docker base tags могут обновляться между отдельными сборками; prod всегда получает именно digest, уже запущенные в dev.

Детали инструментов: [артефакты между workflow](https://docs.github.com/en/actions/tutorials/store-and-share-data), [ожидание здоровья сервисов Compose](https://docs.docker.com/reference/cli/docker/compose/up/).

## Миграции и откат

`release.sh` скачивает candidate-образы, поднимает БД, выполняет `alembic upgrade head`, затем ожидает готовности приложения. Успешный релиз становится `current.env`, предыдущий — `previous.env`. При неуспешном старте предпринимается возврат предыдущих образов; при ошибке миграции старое приложение продолжает работать, а workflow завершается ошибкой.

Ручной возврат приложения: в каталоге окружения скопировать `previous.env` в `candidate.env` и запустить `bash release.sh dev` (или prod). Это не восстановление данных и не downgrade БД. Миграции должны сохранять совместимость с предыдущим приложением. Текущая readiness проверяет точную ревизию: если предыдущий образ ее не поддерживает, откат потребует отдельного совместимого релиза; скрипт сообщит ошибку проверки, а не успех. Автоматический downgrade и резервные копии в прототипе не реализуются.

Создание обычного пользователя при закрытой регистрации (пароль вводится скрыто по запросу):

```sh
cd /srv/baby/prod
docker compose -p baby-prod --env-file .env --env-file current.env -f compose.yaml exec backend \
  .venv/bin/python create_user.py --email parent@example.com --name 'Имя' --timezone Europe/Moscow
```

Скрипт атомарно создаёт пользователя с ролью `user` и пустой дневник. Проверяет email, имя, пароль и часовой пояс; повторный email завершает команду ошибкой без изменения существующей учётной записи. Для автоматизации есть `--password-stdin` (использовать `exec -T`), пароль не передаётся аргументом команды и не печатается. Скрипт не включает публичную регистрацию.

Создание admin на VPS: `docker compose -p baby-dev --env-file .env --env-file current.env -f compose.yaml exec backend .venv/bin/python create_admin.py --email admin@example.com`. Для prod заменить имя проекта. Прямое создание через БД не дает роль user автоматически.

При обновлении не удалять volumes. При проблемах смотреть `docker compose … ps`, `logs --tail=100 backend` и `/ready`; не публиковать строки соединения и содержимое cookie/паролей в отчетах.
