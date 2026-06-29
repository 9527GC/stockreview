#!/bin/sh
set -eu

json_escape() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

APP_ENV_VALUE=$(json_escape "${APP_ENV:-production}")
API_BASE_URL_VALUE=$(json_escape "${API_BASE_URL:-}")
LOGIN_BACKGROUND_URL_VALUE=$(json_escape "${LOGIN_BACKGROUND_URL:-}")

cat > /usr/share/nginx/html/config.js <<EOF
window.__APP_CONFIG__ = {
  APP_ENV: "${APP_ENV_VALUE}",
  API_BASE_URL: "${API_BASE_URL_VALUE}",
  LOGIN_BACKGROUND_URL: "${LOGIN_BACKGROUND_URL_VALUE}"
};
EOF
