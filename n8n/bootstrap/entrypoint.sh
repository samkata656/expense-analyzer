#!/bin/sh
# Imports credentials + workflows from the image, publishes them, then starts n8n.
# Disable with N8N_AUTO_IMPORT=false (e.g. if you prefer to edit workflows only in the UI).
set -eu

if [ "${N8N_AUTO_IMPORT:-true}" = "true" ]; then
  echo "[bootstrap] importing credentials and workflows"
  node /bootstrap/bin/credentials.mjs /tmp/creds
  if [ -n "$(ls -A /tmp/creds 2>/dev/null)" ]; then
    n8n import:credentials --separate --input=/tmp/creds
  fi
  rm -rf /tmp/creds

  n8n import:workflow --separate --input=/bootstrap/workflows
  IDS="expPolicy0000001 expErrors0000001 expIntake0000001 expCfoChat000001"
  if [ "${N8N_IMPORT_TEST_WORKFLOWS:-false}" = "true" ]; then
    n8n import:workflow --separate --input=/bootstrap/test-workflows
    IDS="$IDS expPolicyTest001"
  fi
  for id in $IDS; do
    n8n publish:workflow --id="$id" || echo "[bootstrap] WARN: could not publish $id"
  done
  echo "[bootstrap] done"
fi

exec /docker-entrypoint.sh start
