# Доставка интерактивного демо

Демо из `design/` публикуется отдельно от рабочего приложения. Оно использует только демонстрационные данные в памяти браузера: у контейнера нет API, базы и доступа к дневникам пользователей.

| Среда | URL | Compose-проект | Порт на VPS | Каталог |
| --- | --- | --- | --- | --- |
| dev | https://dev.demo.tishe-doma.ru | `baby-demo-dev` | `127.0.0.1:8083` | `/srv/baby/demo/dev` |
| prod | https://demo.tishe-doma.ru | `baby-demo-prod` | `127.0.0.1:8084` | `/srv/baby/demo/prod` |

Порты рабочего приложения 8081/8082 остаются отдельными. Образ демо: `ghcr.io/mor1ins/baby-calculator/demo`. В публичный каталог попадают только HTML, готовые JS/CSS, шрифт, лицензии и `version.json`; исходники, скриншоты и внутренние документы не публикуются. Поисковая индексация выключена заголовком `X-Robots-Tag`.

## Пайплайны

- **Demo checks** (`demo-checks.yml`): проверки PR, сборка интерфейса, пять существующих браузерных проверок, тесты доставки и отката. Тот же workflow вызывается перед dev-релизом.
- **Deploy demo dev** (`deploy-demo-dev.yml`): автоматически при изменении демо/его доставки в `main`, либо вручную. Необязательный `pr_number` позволяет проверить открытый PR из этого репозитория. Workflow запускается из `main`, исходники фиксируются точным SHA.
- **Promote demo dev to prod** (`deploy-demo-prod.yml`): вручную, с `dev_run_id` успешного запуска **Deploy demo dev**. Продвигает тот же digest из `demo-dev-verified-release`, без пересборки. Артефакт хранится 30 дней.

Dev собирает образ, проверяет HTTP и доступность ресурсов, отсутствие внутренних файлов и соответствие `version.json` исходному SHA. После доставки проверяет HTTPS-домен и ревизию, только затем сохраняет артефакт для prod. Prod также проверяет свою публичную ревизию. Публикация workflow в main может запустить dev автоматически — сначала подготовьте домены и VPS.

Используются уже существующие repository secrets `DEV_SSH_HOST`, `DEV_SSH_USER`, `DEV_SSH_KEY`, `DEV_SSH_KNOWN_HOSTS` и аналогичные `PROD_SSH_*`. Дополнительные secrets и GitHub Environments не требуются. Для одного VPS можно использовать те же значения. GHCR получает временный токен Actions через SSH stdin; временные учётные данные удаляются после доставки.

## Разовая настройка VPS

Эти действия нужны отдельно от добавления файлов пайплайна. Они не выполняются автоматически workflow.

1. Добавьте DNS A-записи `demo.tishe-doma.ru` и `dev.demo.tishe-doma.ru` на IP VPS. В текущей документации основного приложения указан `135.106.163.138`; проверьте адрес перед настройкой. Если есть AAAA-записи, IPv6 также должен вести на этот сервер.
2. Убедитесь, что установлены Docker Compose с поддержкой `up --wait`, Python 3, `flock`, Nginx и Certbot. Порты 8083/8084 должны быть свободны. Публично достаточно 80/443; контейнеры слушают только loopback.
3. Создайте каталоги, принадлежащие существующему пользователю доставки:

```sh
sudo install -d -o baby-deploy -g baby-deploy /srv/baby/demo/dev /srv/baby/demo/prod
printf 'DEMO_PORT=8083\n' | sudo tee /srv/baby/demo/dev/.env >/dev/null
printf 'DEMO_PORT=8084\n' | sudo tee /srv/baby/demo/prod/.env >/dev/null
sudo chown baby-deploy:baby-deploy /srv/baby/demo/dev/.env /srv/baby/demo/prod/.env
sudo chmod 600 /srv/baby/demo/dev/.env /srv/baby/demo/prod/.env
```

4. Скопируйте `edge.conf.example` на VPS. Сначала установите **только первый HTTP server-блок** как `/etc/nginx/sites-available/baby-demo`, включите его ссылкой из `sites-enabled`. Не заменяйте сайт `baby` рабочего приложения. Подготовьте `/var/www/acme`, проверьте `sudo nginx -t` и выполните `sudo systemctl reload nginx`.
5. После распространения DNS выпустите отдельный сертификат:

```sh
sudo certbot certonly --webroot -w /var/www/acme \
  --cert-name demo.tishe-doma.ru \
  -d demo.tishe-doma.ru -d dev.demo.tishe-doma.ru
```

6. Добавьте оставшиеся HTTPS-блоки из `edge.conf.example` в `baby-demo`, проверьте `sudo nginx -t` и перезагрузите Nginx. Проверьте `certbot.timer` и существующий deploy-hook перезагрузки Nginx. Новый сертификат обслуживает оба demo-домена и не заменяет сертификат рабочего приложения. До первого запуска контейнеров HTTPS может отдавать 502.
7. После попадания workflow в main запустите **Deploy demo dev**, проверьте макет на dev, затем укажите ID успешного запуска в **Promote demo dev to prod**. Оба workflow запускайте на ветке main.

Если пакет GHCR имеет отдельные ограничения доступа, разрешите этому репозиторию читать пакет `demo` в его настройках Actions access.

## Релизы и откат

Каждая доставка загружает отдельный каталог `releases/release.*`. Его Compose-конфигурация и манифест не изменяются. Сервер сериализует запуск через `flock`, проверяет, что манифест содержит только image digest ожидаемого репозитория и SHA; манифест не исполняется как shell-код. Загрузка параллельного выпуска не перезаписывает уже проверяемого кандидата.

Ссылки `current` и `previous` указывают на текущий и предыдущий успешные каталоги. При провале healthcheck запускается предыдущий образ **с его Compose-конфигурацией**. Ошибка скачивания не заменяет работающий контейнер. При первом неудачном запуске предыдущей версии нет — workflow завершится ошибкой, контейнер остаётся для диагностики. Ошибка внешней HTTPS-проверки также завершает workflow ошибкой и не создаёт dev-артефакт для продвижения; исправный локальный контейнер при этом остаётся запущен для диагностики DNS/TLS/proxy.

Ручной откат к предыдущему локально доступному образу:

```sh
cd /srv/baby/demo/prod
DEMO_REPOSITORY=ghcr.io/mor1ins/baby-calculator/demo bash previous/release.sh prod
```

Скрипт выполняет `pull`, поэтому для приватного GHCR нужна предварительная авторизация Docker. Альтернатива — снова продвинуть более ранний успешный dev-run, пока доступен его артефакт: workflow сам передаст временные credentials. Старые каталоги и образы автоматически не удаляются; при очистке сохраняйте цели `current` и `previous`.

## Локальная проверка

```sh
python3 -m unittest discover -s deploy/demo -p 'test_*.py'
bash -n deploy/demo/release.sh deploy/demo/send-release.sh deploy/demo/verify-image.sh
docker build -f deploy/demo/Dockerfile --build-arg REVISION="$(git rev-parse HEAD)" -t tishe-demo:check .
bash deploy/demo/verify-image.sh tishe-demo:check "$(git rev-parse HEAD)"
```

Полезные первоисточники: [артефакты Actions между запусками](https://github.com/actions/download-artifact), [ожидание готовности контейнеров Compose](https://docs.docker.com/reference/cli/docker/compose/up/).
