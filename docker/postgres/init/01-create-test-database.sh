#!/bin/sh
# Runs once, when the data volume is first initialised. The e2e suite needs its own database so
# that truncating tables between test files can never touch development data.
set -eu

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  CREATE DATABASE "${POSTGRES_TEST_DB}";
EOSQL
