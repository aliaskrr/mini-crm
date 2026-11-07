#!/usr/bin/env bash
# Writes .env next to docker-compose.yml with fresh secrets: the Postgres password, the JWT
# secret, and the two API keys signed with it (HS256, valid 5 years), as Supabase does:
#   ANON_KEY          public, goes into the frontend (VITE_SUPABASE_PUBLISHABLE_KEY)
#   SERVICE_ROLE_KEY  secret, needed only by scripts/seed.ts; never put it in the frontend
#
#   API_HOST=crm-api.example.com SITE_URL=https://crm.example.com bash make-env.sh
#
# Refuses to overwrite an existing .env: new keys would lock out the running database.
set -euo pipefail
cd "$(dirname -- "${BASH_SOURCE[0]}")"

[[ -e .env ]] && { echo ".env already exists; keeping it" >&2; exit 1; }
: "${API_HOST:?set API_HOST, the API's host name (HTTPS via Caddy)}"
: "${SITE_URL:?set SITE_URL, the frontend's URL}"

b64url() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }
jwt_secret=$(openssl rand -hex 32)
sign() {
  local now exp header payload sig
  now=$(date +%s)
  exp=$((now + 5 * 365 * 24 * 3600))
  header=$(printf '{"alg":"HS256","typ":"JWT"}' | b64url)
  payload=$(printf '{"role":"%s","iss":"supabase","iat":%d,"exp":%d}' "$1" "$now" "$exp" | b64url)
  sig=$(printf '%s.%s' "$header" "$payload" | openssl dgst -sha256 -hmac "$jwt_secret" -binary | b64url)
  printf '%s.%s.%s' "$header" "$payload" "$sig"
}

umask 077
cat > .env <<EOF
API_HOST=$API_HOST
API_EXTERNAL_URL=https://$API_HOST/auth/v1
SITE_URL=$SITE_URL
POSTGRES_PASSWORD=$(openssl rand -hex 24)
JWT_SECRET=$jwt_secret
ANON_KEY=$(sign anon)
SERVICE_ROLE_KEY=$(sign service_role)
EOF
echo "wrote $(pwd)/.env (mode 600)"
