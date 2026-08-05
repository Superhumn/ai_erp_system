#!/usr/bin/env bash
#
# Cloud Agent start script for the AI ERP System.
#
# Runs on every boot. Brings the local MySQL server up (its data dir persists on
# disk, so no schema work is needed here) and returns. The app dev server itself
# is launched as a named terminal (see .cursor/environment.json), not here.
set -euo pipefail

echo "[start] Starting MySQL server..."
sudo service mysql start 2>/dev/null || sudo mysqld_safe --datadir=/var/lib/mysql >/dev/null 2>&1 &

for i in $(seq 1 30); do
  if sudo mysqladmin ping >/dev/null 2>&1; then
    echo "[start] MySQL is up."
    exit 0
  fi
  sleep 1
done

echo "[start] WARNING: MySQL did not report ready within 30s." >&2
exit 0
