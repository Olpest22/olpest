#!/usr/bin/env bash
# Откат olpest на предыдущую выкладку. Запуск на сервере:
#   bash /opt/olpest/deploy/rollback.sh
# Трогает только контейнер olpest-web.
set -euo pipefail
cd /opt/olpest
docker image inspect olpest-web:prev >/dev/null 2>&1 || { echo "Предыдущей версии нет"; exit 1; }
docker tag olpest-web:prev olpest-web:latest
docker compose -p olpest up -d --no-build --force-recreate
echo "Откатился на предыдущую версию."
