# Control Plane Deployment (Resolver)

Ce dossier decrit le deploiement pro du control plane pour le join par code.

## Objectif

- Router `code -> serveur client`.
- Ne jamais stocker les messages/channels/fichiers.
- Exposer seulement les endpoints resolver.

## Endpoints

- `POST /api/resolver/register` (M2M token requis)
- `GET /api/resolver/resolve/:code` (public, rate-limited)
- `GET /api/resolver/stats` (M2M token requis)

## Variables d'environnement

- `RESOLVER_REGISTER_TOKEN`: secret partage entre control plane et instances clients.
- `INSTANCE_PUBLIC_URL`: URL publique (uniquement cote instance client).
- `CONTROL_PLANE_URL`: URL du resolver (uniquement cote instance client).

## Recommandations prod

1. Base Postgres dediee ou managée.
2. Au moins 2 replicas API derriere load balancer.
3. TLS obligatoire.
4. Rotation trimestrielle du `RESOLVER_REGISTER_TOKEN`.
5. Alerte si taux d'erreur resolve > 2% sur 5 min.

## Multi-region (phase 4)

- Deployer un resolver par region avec base partagee globale ou replication multi-region.
- Router DNS geographique (latence).
- Garder `register` idempotent (upsert par code), deja supporte.
