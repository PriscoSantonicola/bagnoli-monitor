#!/bin/bash
# =====================================================================
# Bagnoli Monitor - deploy via docker compose (stack autoconsistente)
# =====================================================================
# Uso dalla cartella del progetto sul server:
#   ./docker-run.sh
# =====================================================================

set -e

if [ ! -f .env ]; then
  echo "ERR: .env mancante. Copia .env.example e compila i valori." >&2
  exit 1
fi

# Rileva compose binary
if docker compose version >/dev/null 2>&1; then
  COMPOSE="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE="docker-compose"
else
  echo "ERR: docker compose non trovato. Installa compose-v2 o docker-compose." >&2
  exit 1
fi

echo "==> Usando: $COMPOSE"

# Stop legacy "docker run" container, se presente
if docker inspect bagnoli-monitor >/dev/null 2>&1; then
  RUNNING_FROM_COMPOSE=$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project"}}' bagnoli-monitor 2>/dev/null || echo "")
  if [ -z "$RUNNING_FROM_COMPOSE" ]; then
    echo "==> Rilevato container legacy (docker run), rimuovo..."
    docker stop bagnoli-monitor >/dev/null 2>&1 || true
    docker rm   bagnoli-monitor >/dev/null 2>&1 || true
  fi
fi

echo "==> Build immagine (no cache)"
$COMPOSE build --no-cache app

echo "==> Up servizio app"
$COMPOSE up -d --force-recreate app

echo "==> Stato servizi"
$COMPOSE ps

echo ""
echo "==> Logs:   $COMPOSE logs -f app"
echo "==> Test:   curl http://127.0.0.1:3000/api/public/avanzamento"
echo "==> Shell:  docker exec -it bagnoli-monitor sh"
