#!/usr/bin/env bash
# simple helper script to migrate a local Postgres database to a Neon project
# requirements: `psql` and `pg_dump` on PATH and an existing Neon connection URL

set -euo pipefail

# if .env exists in project root, load it so LOCAL_DB_* and DATABASE_URL variables are available
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1090
  source .env
  set +a
fi

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <neon-connection-url>"
  echo "Example: $0 postgresql://user:pass@<branch>.<project>.<region>.neon.tech/dbname"
  exit 1
fi

NEON_URL="$1"
if [ -z "$NEON_URL" ]; then
  echo "error: Neon URL argument is empty; pass the connection string explicitly"
  exit 1
fi

# read local connection info from environment (LOCAL_DB_*) or use sane defaults
LOCAL_DB_HOST="${LOCAL_DB_HOST:-localhost}"
LOCAL_DB_PORT="${LOCAL_DB_PORT:-5432}"
LOCAL_DB_USER="${LOCAL_DB_USER:-postgres}"
LOCAL_DB_NAME="${LOCAL_DB_NAME:-brvm}"

: "${LOCAL_DB_HOST:?local DB host must be set in LOCAL_DB_HOST or default to localhost}" 
: "${LOCAL_DB_PORT:?local DB port must be set in LOCAL_DB_PORT or default to 5432}"
: "${LOCAL_DB_USER:?local DB user must be set in LOCAL_DB_USER or default to postgres}"
: "${LOCAL_DB_NAME:?local DB name must be set in LOCAL_DB_NAME or default to brvm}"

export PGPASSWORD="${DB_PASS:-}"  # may be empty

DUMPFILE="/tmp/brvm_dump_$(date +%Y%m%d%H%M%S).sql"

echo "Dumping local database $DB_NAME from $DB_HOST:$DB_PORT..."
pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -F p -d "$DB_NAME" -f "$DUMPFILE"

echo "Importing dump into Neon ($NEON_URL)..."
psql "$NEON_URL" -f "$DUMPFILE"

echo "Migration complete. you can remove $DUMPFILE if not needed."