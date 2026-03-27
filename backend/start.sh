#!/bin/sh
echo "========================================"
echo "  Logic Backend Starting..."
echo "========================================"
echo ""

echo "[1/3] Checking DATABASE_URL..."
if [ -z "$DATABASE_URL" ]; then
  echo "  WARNING: DATABASE_URL not set! Skipping DB setup."
else
  echo "  DATABASE_URL is set. Running prisma db push..."
  ./node_modules/.bin/prisma db push --skip-generate --accept-data-loss 2>&1 || echo "  WARNING: prisma db push failed (tables may already exist)"
  echo "  [OK] DB step done"
  
  echo ""
  echo "[2/3] Running seed..."
  node prisma/seed.js 2>&1 || echo "  WARNING: seed failed (may already be seeded)"
  echo "  [OK] Seed step done"
fi

echo ""
echo "[3/3] Starting NestJS server..."
echo ""
exec node dist/main
