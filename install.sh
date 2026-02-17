#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/opt/privatechat"
COMPOSE_FILE="$APP_DIR/docker-compose.yml"
ENV_FILE="$APP_DIR/.env"
ARCHIVE_URL="${ARCHIVE_URL:-https://github.com/Quentin-Cheron/Chat/archive/refs/heads/main.tar.gz}"
NON_INTERACTIVE="${NON_INTERACTIVE:-0}"
INSTALL_ROLE="${INSTALL_ROLE:-standalone}" # instance | resolver | standalone
DEFAULT_CONTROL_PLANE_URL="${DEFAULT_CONTROL_PLANE_URL:-}"

log() { printf "\n[privatechat] %s\n" "$*"; }
fail() { printf "\n[privatechat][error] %s\n" "$*" >&2; exit 1; }
need_cmd() { command -v "$1" >/dev/null 2>&1 || fail "Commande manquante: $1"; }

check_root() {
  if [ "${EUID}" -ne 0 ]; then
    fail "Lance ce script en root: sudo bash install.sh"
  fi
}

check_os() {
  need_cmd awk
  if [ ! -f /etc/os-release ]; then
    fail "Impossible de détecter l'OS"
  fi
  . /etc/os-release
  case "${ID:-}" in
    ubuntu|debian) ;;
    *) fail "OS non supporté pour MVP. Utilise Debian 12+ ou Ubuntu 22.04/24.04" ;;
  esac
}

ask_inputs() {
  # Domaine : argument positionnel ou variable d'environnement
  DOMAIN="${1:-${DOMAIN:-}}"
  ADMIN_EMAIL="${ADMIN_EMAIL:-}"
  ADMIN_PASSWORD="${ADMIN_PASSWORD:-}"
  CONTROL_PLANE_URL="${CONTROL_PLANE_URL:-}"
  INSTANCE_PUBLIC_URL="${INSTANCE_PUBLIC_URL:-}"
  RESOLVER_REGISTER_TOKEN="${RESOLVER_REGISTER_TOKEN:-}"
  VITE_RESOLVER_BASE_URL="${VITE_RESOLVER_BASE_URL:-}"
  VITE_PUBLIC_JOIN_BASE_URL="${VITE_PUBLIC_JOIN_BASE_URL:-}"
  VITE_TURN_URL="${VITE_TURN_URL:-}"
  VITE_TURN_USERNAME="${VITE_TURN_USERNAME:-}"
  VITE_TURN_PASSWORD="${VITE_TURN_PASSWORD:-}"
  MEDIASOUP_ANNOUNCED_IP="${MEDIASOUP_ANNOUNCED_IP:-}"
  MEDIASOUP_MIN_PORT="${MEDIASOUP_MIN_PORT:-40000}"
  MEDIASOUP_MAX_PORT="${MEDIASOUP_MAX_PORT:-40100}"

  case "$INSTALL_ROLE" in
    instance|resolver|standalone) ;;
    *) fail "INSTALL_ROLE invalide: $INSTALL_ROLE (instance|resolver|standalone)" ;;
  esac

  # Résolution automatique du domaine si non fourni
  if [ -z "$DOMAIN" ]; then
    PUBLIC_IP="$(curl -fsS https://api.ipify.org 2>/dev/null || true)"
    if [ -n "$PUBLIC_IP" ]; then
      DOMAIN="${PUBLIC_IP}.nip.io"
    else
      DOMAIN="$(hostname -f 2>/dev/null || echo localhost)"
    fi
  fi

  # Mode interactif uniquement si pas de domaine fourni et pas NON_INTERACTIVE
  if [ "$NON_INTERACTIVE" != "1" ] && [ -z "${1:-}" ] && [ -z "${DOMAIN_SET:-}" ]; then
    read -r -p "Domaine (ex: chat.mondomaine.com) [$DOMAIN]: " _input
    [ -n "$_input" ] && DOMAIN="$_input"
  fi

  [ -n "$DOMAIN" ] || fail "Domaine requis"

  # Tout le reste est auto-généré
  ADMIN_EMAIL="${ADMIN_EMAIL:-admin@${DOMAIN}}"
  ADMIN_PASSWORD="${ADMIN_PASSWORD:-$(openssl rand -base64 18 | tr -dc 'A-Za-z0-9' | head -c 20)}"
  INSTANCE_PUBLIC_URL="${INSTANCE_PUBLIC_URL:-https://$DOMAIN}"
  MEDIASOUP_ANNOUNCED_IP="${MEDIASOUP_ANNOUNCED_IP:-$DOMAIN}"
  RESOLVER_REGISTER_TOKEN="${RESOLVER_REGISTER_TOKEN:-$(openssl rand -hex 24)}"
  VITE_RESOLVER_BASE_URL="${VITE_RESOLVER_BASE_URL:-$CONTROL_PLANE_URL}"
  VITE_PUBLIC_JOIN_BASE_URL="${VITE_PUBLIC_JOIN_BASE_URL:-$CONTROL_PLANE_URL}"

  if [ "$INSTALL_ROLE" = "instance" ] && [ -z "$CONTROL_PLANE_URL" ] && [ -n "$DEFAULT_CONTROL_PLANE_URL" ]; then
    CONTROL_PLANE_URL="$DEFAULT_CONTROL_PLANE_URL"
  fi
}

install_base_packages() {
  log "Installation dépendances système"
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y
  apt-get install -y ca-certificates curl gnupg lsb-release ufw openssl
}

install_docker() {
  if command -v docker >/dev/null 2>&1; then
    log "Docker déjà installé"
    return
  fi

  log "Installation Docker"
  . /etc/os-release
  case "${ID:-}" in
    ubuntu) DOCKER_DISTRO="ubuntu" ;;
    debian) DOCKER_DISTRO="debian" ;;
    *) fail "Distribution non supportée pour installation Docker automatique: ${ID:-unknown}" ;;
  esac

  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL "https://download.docker.com/linux/${DOCKER_DISTRO}/gpg" | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg

  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/${DOCKER_DISTRO} ${VERSION_CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list

  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable docker
  systemctl start docker
}

setup_firewall() {
  log "Configuration firewall"
  ufw allow 22/tcp >/dev/null || true
  ufw allow 80/tcp >/dev/null || true
  ufw allow 443/tcp >/dev/null || true
  ufw allow "${MEDIASOUP_MIN_PORT}:${MEDIASOUP_MAX_PORT}/udp" >/dev/null || true
  ufw allow "${MEDIASOUP_MIN_PORT}:${MEDIASOUP_MAX_PORT}/tcp" >/dev/null || true
  ufw --force enable >/dev/null || true
}

prepare_app_dir() {
  log "Préparation de $APP_DIR"
  rm -rf "$APP_DIR"
  mkdir -p "$APP_DIR"
}

download_project() {
  if [ -f "./docker-compose.yml" ] && [ -f "./appctl" ]; then
    log "Mode local détecté: copie des fichiers depuis le répertoire courant"
    cp -R . "$APP_DIR/"
    return
  fi

  log "Téléchargement du projet"
  TMP_ARCHIVE="/tmp/privatechat.tar.gz"
  TMP_DIR="/tmp/privatechat-src"
  rm -f "$TMP_ARCHIVE"
  rm -rf "$TMP_DIR"
  mkdir -p "$TMP_DIR"

  curl -fsSL "$ARCHIVE_URL" -o "$TMP_ARCHIVE"
  tar -xzf "$TMP_ARCHIVE" -C "$TMP_DIR" --strip-components=1
  cp -R "$TMP_DIR"/. "$APP_DIR"/
}

gen_env() {
  log "Génération .env"
  BETTER_AUTH_SECRET="$(openssl rand -hex 32)"
  cat > "$ENV_FILE" <<ENV
# Application
APP_NAME=privatechat
DOMAIN=$DOMAIN
NODE_ENV=production

# Admin
ADMIN_EMAIL=$ADMIN_EMAIL
ADMIN_PASSWORD=$ADMIN_PASSWORD

# Authentification
BETTER_AUTH_SECRET=$BETTER_AUTH_SECRET

# Convex self-hosted
# URL publique du backend Convex (queries/mutations WebSocket) — routée par Caddy vers convex:3210
VITE_CONVEX_URL=https://$DOMAIN/convex
# URL publique du site Convex (HTTP actions, Better Auth) — routée par Caddy vers convex:3210/http
VITE_CONVEX_SITE_URL=https://$DOMAIN/convex-site
CONVEX_SITE_URL=https://$DOMAIN/convex-site
# CONVEX_SITE_ORIGIN = URL racine pour le container Convex (sans path)
CONVEX_SITE_ORIGIN=https://$DOMAIN
# URL publique du frontend (pour CORS Better Auth)
SITE_URL=https://$DOMAIN

# Resolver
CONTROL_PLANE_URL=$CONTROL_PLANE_URL
INSTANCE_PUBLIC_URL=$INSTANCE_PUBLIC_URL
RESOLVER_REGISTER_TOKEN=$RESOLVER_REGISTER_TOKEN
VITE_RESOLVER_BASE_URL=$VITE_RESOLVER_BASE_URL
VITE_PUBLIC_JOIN_BASE_URL=$VITE_PUBLIC_JOIN_BASE_URL

# Mediasoup (WebRTC)
VITE_TURN_URL=$VITE_TURN_URL
VITE_TURN_USERNAME=$VITE_TURN_USERNAME
VITE_TURN_PASSWORD=$VITE_TURN_PASSWORD
MEDIASOUP_ANNOUNCED_IP=$MEDIASOUP_ANNOUNCED_IP
MEDIASOUP_MIN_PORT=$MEDIASOUP_MIN_PORT
MEDIASOUP_MAX_PORT=$MEDIASOUP_MAX_PORT
ENV
}

deploy_stack() {
  log "Déploiement stack docker"
  cd "$APP_DIR"
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" --profile selfhost up -d --build
}

setup_convex() {
  log "Configuration Convex"
  cd "$APP_DIR"

  # Attendre que Convex soit prêt
  log "Attente du démarrage de Convex..."
  for i in $(seq 1 30); do
    if docker compose exec -T convex wget -qO- http://localhost:3210/version >/dev/null 2>&1; then
      break
    fi
    sleep 2
  done

  # Générer la clé admin
  log "Génération de la clé admin Convex..."
  CONVEX_ADMIN_KEY="$(docker compose exec -T convex ./generate_admin_key.sh 2>/dev/null | tr -d '[:space:]')" \
    || fail "Impossible de générer la clé admin Convex"

  # Déployer les fonctions
  log "Déploiement des fonctions Convex..."
  docker run --rm \
    --network "$(docker compose ls -q | head -1)_default" \
    -e CONVEX_SELF_HOSTED_URL=http://convex:3210 \
    -e CONVEX_SELF_HOSTED_ADMIN_KEY="$CONVEX_ADMIN_KEY" \
    -v "$APP_DIR/web:/app" \
    -w /app \
    node:20-alpine \
    sh -c "npm install -g pnpm && pnpm install --no-frozen-lockfile && rm -f .env.local && npx convex deploy --yes" \
    || fail "Déploiement des fonctions Convex échoué"

  # Setter les variables d'environnement
  log "Configuration des variables Convex..."
  BETTER_AUTH_SECRET="$(grep ^BETTER_AUTH_SECRET "$ENV_FILE" | cut -d= -f2)"
  CONVEX_SITE_URL_VAL="$(grep ^CONVEX_SITE_URL "$ENV_FILE" | cut -d= -f2)"
  SITE_URL_VAL="$(grep ^SITE_URL "$ENV_FILE" | cut -d= -f2)"
  RESOLVER_TOKEN="$(grep ^RESOLVER_REGISTER_TOKEN "$ENV_FILE" | cut -d= -f2)"
  DOMAIN_VAL="$(grep ^DOMAIN "$ENV_FILE" | cut -d= -f2)"

  docker run --rm \
    --network "$(docker network ls --filter name=privatechat --format '{{.Name}}' | head -1)" \
    -e CONVEX_SELF_HOSTED_URL=http://convex:3210 \
    -e CONVEX_SELF_HOSTED_ADMIN_KEY="$CONVEX_ADMIN_KEY" \
    -v "$APP_DIR/web:/app" \
    -w /app \
    node:20-alpine \
    sh -c "
      npm install -g pnpm && pnpm install --no-frozen-lockfile && rm -f .env.local &&
      npx convex env set BETTER_AUTH_SECRET '$BETTER_AUTH_SECRET' &&
      npx convex env set BETTER_AUTH_URL 'https://$DOMAIN_VAL/api/auth' &&
      npx convex env set SITE_URL '$SITE_URL_VAL' &&
      npx convex env set RESOLVER_REGISTER_TOKEN '$RESOLVER_TOKEN'
    " || fail "Configuration des variables Convex échouée"

  log "Convex configuré avec succès"
}

health_check() {
  log "Vérification locale"
  sleep 4
  curl -fsS "http://localhost" >/dev/null || fail "Web health KO"
}

final_output() {
  cat <<TXT

Installation terminée.

URL: https://$DOMAIN
Admin: $ADMIN_EMAIL
Mot de passe temporaire admin: $ADMIN_PASSWORD
Invitation (MVP): https://$DOMAIN/invite/<code>
Role: $INSTALL_ROLE
Action requise: connectez-vous puis changez le mot de passe sur /security/change-password

Commandes utiles:
  cd $APP_DIR
  ./appctl status
  ./appctl logs
  ./appctl doctor
TXT
}

main() {
  check_root
  check_os
  ask_inputs "${1:-}"
  install_base_packages
  install_docker
  setup_firewall
  prepare_app_dir
  download_project
  gen_env
  deploy_stack
  setup_convex
  health_check
  final_output
}

main "$@"
