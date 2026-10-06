#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p .local
chmod 700 .local
if [[ ! -f .env ]]; then
 node --input-type=module <<'JS'
import {randomBytes} from 'node:crypto';
import {writeFileSync} from 'node:fs';
const password=randomBytes(32).toString('hex');
writeFileSync('.env',`DATABASE_URL=postgresql://axl:${password}@localhost:5432/axl\nPOSTGRES_PASSWORD=${password}\n`,{mode:0o600,flag:'wx'});
JS
fi
docker compose up -d --wait db
existing=$(docker compose exec -T db psql -U axl -d axl -Atc "SELECT to_regclass('public.\"Settings\"') IS NOT NULL")
if [[ "$existing" == "f" && -s .local/database.sql ]]; then
 docker compose exec -T db psql -v ON_ERROR_STOP=1 -U axl -d axl < .local/database.sql
fi
npm run db:migrate
npm run db:seed
