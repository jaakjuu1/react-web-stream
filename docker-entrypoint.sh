#!/bin/sh
set -e

echo "=== Container starting ==="
echo "NODE_ENV: $NODE_ENV"
echo "PORT: $PORT"
echo "DATABASE_URL: $DATABASE_URL"
echo "Working directory: $(pwd)"
echo "Files in current directory:"
ls -la

echo ""
echo "=== Running database migrations ==="
npx prisma migrate deploy || {
  echo "Migration failed!"
  exit 1
}

echo ""
echo "=== Starting server ==="
exec "$@"
