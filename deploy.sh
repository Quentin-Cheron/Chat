#!/bin/bash
set -e

BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BOLD}=== PrivateChat Deploy ===${NC}"

# 1. Auto-générer le .env si absent
if [ ! -f .env ]; then
  echo -e "${YELLOW}[!] No .env found — generating automatically...${NC}"

  # Détecter le domaine : variable d'environnement > argument > auto-detect IP publique
  if [ -n "$DOMAIN" ]; then
    DETECTED_DOMAIN="$DOMAIN"
  elif [ -n "$1" ]; then
    DETECTED_DOMAIN="$1"
  else
    DETECTED_DOMAIN=$(curl -sf https://api.ipify.org || curl -sf https://ifconfig.me || echo "localhost")
  fi

  # Détecter l'IP publique pour mediasoup
  PUBLIC_IP=$(curl -sf https://api.ipify.org || curl -sf https://ifconfig.me || echo "127.0.0.1")

  cat > .env <<EOF
APP_NAME=privatechat
DOMAIN=${DETECTED_DOMAIN}
ADMIN_EMAIL=admin@${DETECTED_DOMAIN}

# Convex
CONVEX_SITE_ORIGIN=https://${DETECTED_DOMAIN}
VITE_CONVEX_URL=https://${DETECTED_DOMAIN}/convex
VITE_CONVEX_SITE_URL=https://${DETECTED_DOMAIN}/convex-site

# Frontend
VITE_RESOLVER_BASE_URL=
VITE_PUBLIC_JOIN_BASE_URL=https://${DETECTED_DOMAIN}
VITE_TURN_URL=
VITE_TURN_USERNAME=
VITE_TURN_PASSWORD=

# MediaSoup
MEDIASOUP_ANNOUNCED_IP=${PUBLIC_IP}
MEDIASOUP_MIN_PORT=40000
MEDIASOUP_MAX_PORT=40100

# Misc
RESOLVER_REGISTER_TOKEN=change-me-resolver
NODE_ENV=production
EOF

  echo -e "${GREEN}[✓] .env generated for domain: ${DETECTED_DOMAIN}${NC}"
fi

# 2. Git pull
echo -e "${GREEN}[1/3] Pulling latest code...${NC}"
git pull

# 3. Build et démarrage
echo -e "${GREEN}[2/3] Building and starting containers...${NC}"
docker compose --profile selfhost up -d --build

# 4. Status
echo -e "${GREEN}[3/3] Done!${NC}"
echo ""
docker compose ps
echo ""
source .env
echo -e "${GREEN}✓ App running at https://${DOMAIN}${NC}"
