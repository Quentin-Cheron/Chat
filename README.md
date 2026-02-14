# PrivateChat VPS (MVP)

MVP d'une plateforme "Discord privé" auto-hébergée sur VPS avec une seule commande d'installation.

## Quick start (sur VPS Debian/Ubuntu)

```bash
curl -fsSL https://example.com/install.sh | bash
```

## Go-live en 1 commande curl (recommande: autonome)

### Client self-service (aucune saisie)

```bash
curl -fsSL https://example.com/install.sh | sudo env NON_INTERACTIVE=1 bash
```

Le script autodetecte:
- `DOMAIN` via IP publique (`<ip>.nip.io`) si possible
- `ADMIN_EMAIL` (`admin@<domain>`)
- secrets internes

Mode par defaut: **standalone** (pas de resolver central, invitation directe via `https://instance/invite/<code>`).

### 1) Resolver central (optionnel)

```bash
curl -fsSL https://example.com/install.sh | sudo env \
  NON_INTERACTIVE=1 \
  INSTALL_ROLE=resolver \
  DOMAIN=resolver.example.com \
  ADMIN_EMAIL=admin@example.com \
  RESOLVER_REGISTER_TOKEN='change-me-shared-token' \
  bash
```

### 2) Instance client (serveur d'un utilisateur)

```bash
curl -fsSL https://example.com/install.sh | sudo env \
  NON_INTERACTIVE=1 \
  INSTALL_ROLE=instance \
  DOMAIN=chat-client.example.com \
  ADMIN_EMAIL=admin@example.com \
  CONTROL_PLANE_URL=https://resolver.example.com \
  RESOLVER_REGISTER_TOKEN='change-me-shared-token' \
  bash
```

En local (dev rapide):

```bash
cp .env.example .env
docker compose up -d --build
```

Puis ouvre: `http://localhost`.

## Services

- `caddy`: reverse proxy web + TLS auto en production
- `web`: frontend React + Vite servi via Nginx
- `api`: API NestJS + Fastify (health + bootstrap)
- `postgres`: base de données
- `redis`: cache/pubsub

## Structure

- `api/`: projet backend séparé (NestJS)
- `web/`: projet frontend séparé (React + Vite)
- `desktop/`: client desktop (Tauri + React)

## Coolify

Sur Coolify, deploye avec le `docker-compose.yml` du repo:

- le service `caddy` est dans le profil `selfhost` et ne demarre pas par defaut
- configure Coolify pour router le domaine vers le service `web` sur le port `80`

Ainsi, tu n'as pas de montage `infra/caddy/Caddyfile` cote Coolify.

## Invitations directes (mode recommande)

Chaque instance partage un lien direct:

- `https://votre-instance.com/invite/<code>`

Avantages:

- pas de service central obligatoire
- zero redirection intermediaire
- architecture plus simple a operer

## Join par code (control plane optionnel)

Le projet supporte aussi un flux "entrer un code -> redirection vers le bon serveur":

- Endpoint resolver central:
  - `POST /api/resolver/register` (protégé par `x-resolver-token`)
  - `GET /api/resolver/resolve/:code`
- Frontend:
  - `/join` pour saisir un code
  - `/invite/:code` sur chaque instance cible

Configuration minimale:

- Sur le control plane (instance centrale):
  - `RESOLVER_REGISTER_TOKEN=<secret-commun>`
- Sur chaque instance client:
  - `CONTROL_PLANE_URL=https://resolver.votre-domaine.com`
  - `INSTANCE_PUBLIC_URL=https://chat-client.exemple.com`
  - `RESOLVER_REGISTER_TOKEN=<secret-commun>`
- Optionnel côté web (build args Vite):
  - `VITE_RESOLVER_BASE_URL=https://resolver.votre-domaine.com`
  - `VITE_PUBLIC_JOIN_BASE_URL=https://resolver.votre-domaine.com`

Quand un owner crée une invitation, son API enregistre automatiquement `code -> INSTANCE_PUBLIC_URL` sur le control plane.  
Un invité saisit le code sur `/join`, puis est redirigé vers `/invite/:code` sur l'instance cible.

## Execution par phases

### Phase 1 - MVP resolver (terminee)

- Resolver API:
  - `POST /api/resolver/register`
  - `GET /api/resolver/resolve/:code`
- Auto-enregistrement des codes a la creation d'invite cote instance client.
- Pages:
  - `/join`
  - `/invite/:code`

### Phase 2 - UX (terminee)

- Saisie code avec redirection auto.
- Gestion d'erreurs explicites (code invalide/expire).
- Historique local des derniers serveurs resolus.
- Login/register avec retour automatique sur invitation.

### Phase 3 - Securite/anti-abus (terminee)

- Auth M2M resolver par token.
- Comparaison du token en timing-safe.
- Rate limiting en memoire sur `register`, `resolve`, `stats`.
- Endpoint observabilite:
  - `GET /api/resolver/stats` (token requis)
  - `DELETE /api/resolver/expired` (token requis)

### Phase 4 - Ops/HA (livrables prepares)

- Runbook control plane: `infra/control-plane/README.md`
- Smoke test resolver: `scripts/resolver-smoke.sh`
- Preconisations multi-replicas + multi-region documentees.

### Phase 5 - Desktop app (terminee)

- Projet `desktop/` ajoute.
- Ecran `Join by code` connecte au resolver.
- Historique local des derniers serveurs resolus.
- Route de redirection vers l'instance cible depuis l'application desktop.

### Phase 6 - Desktop multi-serveurs (terminee)

- Favoris serveurs recents.
- Suppression d'un serveur recent.
- Connexion directe par URL serveur (sans code).

## Commandes d'ops

```bash
./appctl status
./appctl logs
./appctl update
./appctl backup
./appctl doctor
```
