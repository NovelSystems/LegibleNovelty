#!/bin/sh
# Runs once, on a fresh Postgres data directory, via the official image's
# /docker-entrypoint-initdb.d hook (after the main $POSTGRES_DB is created).
#
# Provisions two additional logical databases on the same instance:
#   * <db>_shadow — used by `prisma migrate dev` to diff schema changes.
#   * <db>_test   — the dedicated database check.sh runs migrations and tests
#                   against (TEST_DATABASE_URL), so repeated runs don't
#                   accumulate leftover test data against each other.
#
# Both are created with UTF-8 encoding to match the main database.
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<EOSQL
CREATE DATABASE "${POSTGRES_DB}_shadow" WITH ENCODING 'UTF8' TEMPLATE template0;
CREATE DATABASE "${POSTGRES_DB}_test" WITH ENCODING 'UTF8' TEMPLATE template0;
EOSQL

echo "Provisioned ${POSTGRES_DB}_shadow and ${POSTGRES_DB}_test databases (UTF8)."
