#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
umask 077
mkdir -p .local
chmod 700 .local
dump_file=$(mktemp .local/database.sql.XXXXXX)
trap 'rm -f "$dump_file"' EXIT
docker compose exec -T db pg_dump -U axl -d axl --no-owner --no-acl > "$dump_file"
test -s "$dump_file"
mv "$dump_file" .local/database.sql
printf '%s\n' 'Respaldo local guardado en .local/database.sql.'
