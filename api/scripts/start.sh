#!/usr/bin/env sh
set -eu

attempt=1
max_attempts=20

while [ "$attempt" -le "$max_attempts" ]; do
  echo "[api] applying prisma schema (attempt $attempt/$max_attempts)"
  if npx prisma db push --accept-data-loss; then
    echo "[api] prisma schema ready"
    break
  fi

  if [ "$attempt" -eq "$max_attempts" ]; then
    echo "[api] schema preparation failed after $max_attempts attempts; starting API anyway"
    break
  fi

  attempt=$((attempt + 1))
  sleep 3
done

exec node dist/src/main.js
