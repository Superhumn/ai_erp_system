#!/usr/bin/env bash
#
# Cloud Agent start script for the AI ERP System.
#
# Runs on every boot: brings the local MySQL server up and waits until it
# actually accepts connections. The app dev server itself is launched as a
# named terminal (see .cursor/environment.json), not here.
set -uo pipefail

DATADIR=/var/lib/mysql
SENTINEL=/var/lib/.mysql_overlay_copied

sudo service mysql stop >/dev/null 2>&1 || true

# On a Cloud Agent build-snapshot boot, the MySQL datadir is captured on the
# read-only squashfs *lower* layer of the overlay root filesystem. InnoDB
# probes the system tablespace with an O_DIRECT read at startup, which squashfs
# rejects with EINVAL, so mysqld refuses to start. Force an overlayfs copy-up of
# the datadir into the writable (ext4) upper layer once, so those reads succeed.
if [ ! -e "$SENTINEL" ] && [ -d "$DATADIR" ]; then
  echo "[start] Forcing overlay copy-up of MySQL datadir..."
  if sudo cp -a "$DATADIR" "${DATADIR}.copyup"; then
    sudo rm -rf "$DATADIR"
    sudo mv "${DATADIR}.copyup" "$DATADIR"
    sudo touch "$SENTINEL"
  fi
fi

echo "[start] Starting MySQL server..."
sudo service mysql start >/dev/null 2>&1 \
  || sudo bash -c "nohup mysqld_safe --datadir='$DATADIR' >/var/log/mysql/mysqld_safe.out 2>&1 &"

for _ in $(seq 1 60); do
  if sudo mysqladmin ping >/dev/null 2>&1; then
    echo "[start] MySQL is up."
    exit 0
  fi
  sleep 1
done

echo "[start] ERROR: MySQL did not become ready within 60s." >&2
sudo tail -n 40 /var/log/mysql/error.log 2>/dev/null || true
exit 1
