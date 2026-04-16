#!/bin/bash
# =====================================================================
# Bagnoli Monitor — script deploy single container
# =====================================================================
# Uso: ./docker-run.sh (dalla cartella del progetto sul server)
# =====================================================================

set -e

IMAGE_NAME="bagnoli-monitor:latest"
CONTAINER_NAME="bagnoli-monitor"
PORT_HOST=3000
PORT_CONTAINER=3000
ENV_FILE=".env"

echo "==> Build immagine $IMAGE_NAME"
docker build -t "$IMAGE_NAME" .

echo "==> Stop container esistente (se presente)"
docker stop  "$CONTAINER_NAME" 2>/dev/null || true
docker rm    "$CONTAINER_NAME" 2>/dev/null || true

echo "==> Run nuovo container"
docker run -d \
  --name "$CONTAINER_NAME" \
  --restart unless-stopped \
  -p 127.0.0.1:${PORT_HOST}:${PORT_CONTAINER} \
  --add-host=host.docker.internal:host-gateway \
  --env-file "$ENV_FILE" \
  "$IMAGE_NAME"

echo "==> Container avviato."
echo "==> Logs live: docker logs -f $CONTAINER_NAME"
echo "==> Test:      curl http://127.0.0.1:${PORT_HOST}/api/cruscotto"
