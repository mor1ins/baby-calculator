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
4. Настроить серверный доступ только на чтение к приватным GHCR-образам через `docker login ghcr.io` от пользователя доставки. Токен не включать в image или `.env` приложения.
5. Настроить Nginx по `edge.conf.example`, получить и настроить автоматическое обновление сертификатов ACME. Имена в примере заменить до применения. Проверить `nginx -t` и HTTPS.
6. Сохранить repository secrets `DEV_SSH_HOST`, `DEV_SSH_USER`, `DEV_SSH_KEY`, `DEV_SSH_KNOWN_HOSTS`; аналогичные `PROD_…`. Ключ сервера получить по доверенному каналу. Доставка не использует автоматическое принятие SSH-ключей.

GitHub Environments не требуются. Конкретные сервер, DNS, сертификаты и secrets пока не настроены; внешняя доставка не запускалась.

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

Создание admin на VPS: `docker compose -p baby-dev --env-file .env --env-file current.env -f compose.yaml exec backend .venv/bin/python create_admin.py --email admin@example.com`. Для prod заменить имя проекта. Прямое создание через БД не дает роль user автоматически.

При обновлении не удалять volumes. При проблемах смотреть `docker compose … ps`, `logs --tail=100 backend` и `/ready`; не публиковать строки соединения и содержимое cookie/паролей в отчетах.
