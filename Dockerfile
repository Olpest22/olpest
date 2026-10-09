# Статический сайт olpest внутри маленького Caddy.
# Порт 80 открыт только внутри Docker-сети, наружу ничего не публикуется:
# HTTPS и домен обслуживает Caddy от Omad.
FROM caddy:2-alpine

COPY Caddyfile /etc/caddy/Caddyfile
COPY site /srv
