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
  DOMAIN="${DOMAIN:-}"
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

  if [ "$NON_INTERACTIVE" = "1" ]; then
    if [ -z "$DOMAIN" ]; then
      PUBLIC_IP="$(curl -fsS https://api.ipify.org || true)"
      if [ -n "$PUBLIC_IP" ]; then
        DOMAIN="${PUBLIC_IP}.nip.io"
      fi
    fi

    if [ -z "$DOMAIN" ]; then
      HOST_FQDN="$(hostname -f 2>/dev/null || true)"
      DOMAIN="${HOST_FQDN:-localhost}"
    fi

    if [ -z "$ADMIN_EMAIL" ]; then
      ADMIN_EMAIL="admin@${DOMAIN}"
    fi
  else
    read -r -p "Domaine (ex: chat.mondomaine.com): " DOMAIN
    read -r -p "Email admin: " ADMIN_EMAIL
    read -r -s -p "Mot de passe admin (laisser vide = auto): " ADMIN_PASSWORD
    printf "\n"

    if [ "$INSTALL_ROLE" = "instance" ]; then
      read -r -p "URL control-plane resolver (optionnel, ex: https://resolver.mondomaine.com): " CONTROL_PLANE_URL
    fi
  fi

  [ -n "$DOMAIN" ] || fail "Domaine requis"
  [ -n "$ADMIN_EMAIL" ] || fail "Email requis"

  if [ -z "$ADMIN_PASSWORD" ]; then
    ADMIN_PASSWORD="$(openssl rand -base64 18 | tr -dc 'A-Za-z0-9@#%+=' | head -c 20)"
  fi
  if [ -z "$INSTANCE_PUBLIC_URL" ]; then
    INSTANCE_PUBLIC_URL="https://$DOMAIN"
  fi
  if [ -z "$MEDIASOUP_ANNOUNCED_IP" ]; then
    MEDIASOUP_ANNOUNCED_IP="$DOMAIN"
  fi
  if [ -z "$RESOLVER_REGISTER_TOKEN" ]; then
    RESOLVER_REGISTER_TOKEN="$(openssl rand -hex 24)"
  fi

  if [ "$INSTALL_ROLE" = "instance" ] && [ -z "$CONTROL_PLANE_URL" ] && [ -n "$DEFAULT_CONTROL_PLANE_URL" ]; then
    CONTROL_PLANE_URL="$DEFAULT_CONTROL_PLANE_URL"
  fi

  if [ -z "$VITE_RESOLVER_BASE_URL" ]; then
    VITE_RESOLVER_BASE_URL="$CONTROL_PLANE_URL"
  fi
  if [ -z "$VITE_PUBLIC_JOIN_BASE_URL" ]; then
    VITE_PUBLIC_JOIN_BASE_URL="$CONTROL_PLANE_URL"
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
  cat > "$ENV_FILE" <<ENV
APP_NAME=privatechat
DOMAIN=$DOMAIN
ADMIN_EMAIL=$ADMIN_EMAIL
ADMIN_PASSWORD=$ADMIN_PASSWORD
INSTANCE_PUBLIC_URL=$INSTANCE_PUBLIC_URL
CONTROL_PLANE_URL=$CONTROL_PLANE_URL
RESOLVER_REGISTER_TOKEN=$RESOLVER_REGISTER_TOKEN
VITE_RESOLVER_BASE_URL=$VITE_RESOLVER_BASE_URL
VITE_PUBLIC_JOIN_BASE_URL=$VITE_PUBLIC_JOIN_BASE_URL
VITE_TURN_URL=$VITE_TURN_URL
VITE_TURN_USERNAME=$VITE_TURN_USERNAME
VITE_TURN_PASSWORD=$VITE_TURN_PASSWORD
MEDIASOUP_ANNOUNCED_IP=$MEDIASOUP_ANNOUNCED_IP
MEDIASOUP_MIN_PORT=$MEDIASOUP_MIN_PORT
MEDIASOUP_MAX_PORT=$MEDIASOUP_MAX_PORT
NODE_ENV=production
CONVEX_ADMIN_KEY=
ENV
}

deploy_stack() {
  log "Déploiement stack docker"
  cd "$APP_DIR"

  # Démarrer Convex en premier pour récupérer la clé admin
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d convex
  log "Attente démarrage Convex..."
  for i in $(seq 1 30); do
    if docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T convex sh -c 'test -f /convex/data/credentials/instance_secret' 2>/dev/null; then
      break
    fi
    sleep 2
  done

  INSTANCE_NAME="$(docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T convex sh -c 'cat /convex/data/credentials/instance_name' 2>/dev/null | tr -d '[:space:]')"
  INSTANCE_SECRET="$(docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T convex sh -c 'cat /convex/data/credentials/instance_secret' 2>/dev/null | tr -d '[:space:]')"

  if [ -n "$INSTANCE_NAME" ] && [ -n "$INSTANCE_SECRET" ]; then
    CONVEX_ADMIN_KEY="${INSTANCE_NAME}|${INSTANCE_SECRET}"
    sed -i "s#CONVEX_ADMIN_KEY=.*#CONVEX_ADMIN_KEY=${CONVEX_ADMIN_KEY}#" "$ENV_FILE"
    log "Clé admin Convex récupérée"
  else
    fail "Impossible de récupérer la clé admin Convex"
  fi

  # Déployer tout le reste
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" --profile selfhost up -d --build
}

health_check() {
  log "Vérification locale"
  sleep 6
  curl -fsS "http://localhost" >/dev/null || fail "Web KO"
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
  ask_inputs
  install_base_packages
  install_docker
  setup_firewall
  prepare_app_dir
  download_project
  gen_env
  deploy_stack
  health_check
  final_output
}

main "$@"
