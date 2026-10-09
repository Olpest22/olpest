#!/usr/bin/env bash
# Выполняется НА СЕРВЕРЕ (его запускает deploy.ps1).
# Трогает только /opt/olpest и контейнер olpest-web. Omad не трогает:
#   - не публикует порты 80/443,
#   - не читает и не пишет /opt/omad,
#   - docker compose вызывается только для проекта olpest,
#   - никаких глобальных prune/down/restart.
set -euo pipefail

DEST="/opt/olpest"
SRC="${1:-/tmp/olpest-release}"

[ "$DEST" = "/opt/olpest" ] || { echo "Отказ: неожиданный путь $DEST"; exit 1; }
[ -d "$SRC/site" ] && [ -f "$SRC/docker-compose.yml" ] || { echo "Нет файлов релиза в $SRC"; exit 1; }
command -v docker >/dev/null || { echo "docker не найден"; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "Нужен docker compose v2"; exit 1; }

# имя общей сети с Caddy от Omad (по умолчанию edge, можно переопределить в /opt/olpest/.env)
NET="edge"
if [ -f "$DEST/.env" ]; then
  v="$(grep -E '^EDGE_NETWORK=' "$DEST/.env" | tail -n1 | cut -d= -f2- || true)"
  [ -n "$v" ] && NET="$v"
fi
if ! docker network inspect "$NET" >/dev/null 2>&1; then
  echo "Создаю общую сеть $NET (существующие контейнеры это не затрагивает)"
  docker network create "$NET" >/dev/null
fi

# раскладываем файлы только в /opt/olpest; .env сохраняется
mkdir -p "$DEST"
rm -rf "$DEST/site" "$DEST/deploy"
cp -a "$SRC/site" "$DEST/site"
cp -a "$SRC/deploy" "$DEST/deploy"
cp "$SRC/Dockerfile" "$SRC/Caddyfile" "$SRC/docker-compose.yml" "$DEST/"

cd "$DEST"
HAD_PREV=0
if docker image inspect olpest-web:latest >/dev/null 2>&1; then
  docker tag olpest-web:latest olpest-web:prev
  HAD_PREV=1
fi

echo "Собираю и запускаю olpest-web…"
docker compose -p olpest up -d --build

check() {
  for _ in $(seq 1 15); do
    if docker exec olpest-web wget -q -O /dev/null http://127.0.0.1/ 2>/dev/null &&
       docker run --rm --network "$NET" --entrypoint wget olpest-web:latest -q -O /dev/null http://olpest-web/ 2>/dev/null; then
      return 0
    fi
    sleep 1
  done
  return 1
}

if check; then
  echo "OK: olpest-web отвечает в сети $NET по адресу http://olpest-web/"
else
  echo "Новая версия не отвечает."
  if [ "$HAD_PREV" = 1 ]; then
    docker tag olpest-web:prev olpest-web:latest
    docker compose -p olpest up -d --no-build --force-recreate
    echo "Вернул предыдущую версию."
  fi
  exit 1
fi

case "$SRC" in /tmp/olpest-release*) rm -rf "$SRC" ;; esac
rm -f /tmp/olpest-release.tar.gz
docker compose -p olpest ps
