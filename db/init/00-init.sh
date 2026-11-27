#!/bin/bash
# Runs once, on the first boot of an empty data volume.
# Creates:
#   - app_rw        : owns the "expenses" database (web app + n8n writes)
#   - cfo_readonly  : SELECT-only role for the CFO AI agent's SQL tool
#   - n8n           : owns the "n8n" database (n8n's internal storage)
set -euo pipefail

: "${APP_DB_PASSWORD:?APP_DB_PASSWORD is required}"
: "${CFO_DB_PASSWORD:?CFO_DB_PASSWORD is required}"
: "${N8N_DB_PASSWORD:?N8N_DB_PASSWORD is required}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
  -v app_pw="$APP_DB_PASSWORD" -v cfo_pw="$CFO_DB_PASSWORD" -v n8n_pw="$N8N_DB_PASSWORD" <<-'EOSQL'
  CREATE ROLE app_rw LOGIN PASSWORD :'app_pw';
  CREATE ROLE cfo_readonly LOGIN PASSWORD :'cfo_pw';
  CREATE ROLE n8n LOGIN PASSWORD :'n8n_pw';
  CREATE DATABASE expenses OWNER app_rw;
  CREATE DATABASE n8n OWNER n8n;
  REVOKE ALL ON DATABASE expenses FROM PUBLIC;
  GRANT CONNECT ON DATABASE expenses TO app_rw, cfo_readonly;
  -- nobody but the owner may even connect to the other databases
  REVOKE CONNECT ON DATABASE n8n FROM PUBLIC;
  REVOKE CONNECT ON DATABASE postgres FROM PUBLIC;
EOSQL

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname expenses <<-'EOSQL'
  CREATE EXTENSION IF NOT EXISTS vector;
  CREATE EXTENSION IF NOT EXISTS pgcrypto;
  ALTER SCHEMA public OWNER TO app_rw;
  GRANT USAGE ON SCHEMA public TO cfo_readonly;
  -- read-only queries from the CFO agent can never run away
  ALTER ROLE cfo_readonly SET statement_timeout = '5s';
  ALTER ROLE cfo_readonly SET default_transaction_read_only = on;
EOSQL
