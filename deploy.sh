#!/bin/bash
set -e

BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BOLD}=== PrivateChat Deploy ===${NC}"

# 1. Vérifier que .env existe
if [ ! -f .env ]; then
  echo -e "${YELLOW}[!] No .env found — creating from .env.example...${NC}"
  cp .env.example .env
  echo -e "${RED}[!] Please fill in your .env before continuing:${NC}"
  echo -e "    ${BOLD}nano .env${NC}"
  echo ""
  echo "    Required fields:"
  echo "      DOMAIN, ADMIN_EMAIL, CONVEX_SITE_ORIGIN"
  echo "      VITE_CONVEX_URL, VITE_CONVEX_SITE_URL"
  echo "      MEDIASOUP_ANNOUNCED_IP (your VPS public IP)"
  echo ""
  exit 1
fi

# 2. Vérifier les variables critiques
source .env

MISSING=()
[ -z "$DOMAIN" ]               && MISSING+=("DOMAIN")
[ -z "$ADMIN_EMAIL" ]          && MISSING+=("ADMIN_EMAIL")
[ -z "$CONVEX_SITE_ORIGIN" ]   && MISSING+=("CONVEX_SITE_ORIGIN")
[ -z "$VITE_CONVEX_URL" ]      && MISSING+=("VITE_CONVEX_URL")
[ -z "$VITE_CONVEX_SITE_URL" ] && MISSING+=("VITE_CONVEX_SITE_URL")
[ -z "$MEDIASOUP_ANNOUNCED_IP" ] && MISSING+=("MEDIASOUP_ANNOUNCED_IP")

if [ ${#MISSING[@]} -ne 0 ]; then
  echo -e "${RED}[!] Missing required variables in .env:${NC}"
  for v in "${MISSING[@]}"; do
    echo "      - $v"
  done
  echo ""
  echo -e "    Edit your .env: ${BOLD}nano .env${NC}"
  exit 1
fi

# 3. Git pull
echo -e "${GREEN}[1/3] Pulling latest code...${NC}"
git pull

# 4. Build et démarrage
echo -e "${GREEN}[2/3] Building and starting containers...${NC}"
docker compose --profile selfhost up -d --build

# 5. Status
echo -e "${GREEN}[3/3] Done!${NC}"
echo ""
docker compose ps
echo ""
echo -e "${GREEN}✓ App running at https://${DOMAIN}${NC}"
