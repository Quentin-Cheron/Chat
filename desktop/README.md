# PrivateChat Desktop

Client desktop Tauri + React pour rejoindre une instance privee via code.

## Variables

- `VITE_RESOLVER_BASE_URL` (default: `https://localhost`)

## Dev

```bash
cd desktop
npm install
npm run tauri dev
```

## Build

```bash
cd desktop
npm install
npm run tauri build
```

## One-shot macOS

Depuis la racine du repo:

```bash
./scripts/desktop-mac-one-shot.sh
```

## Signature & notarization macOS

Signer le bundle:

```bash
export APPLE_DEVELOPER_IDENTITY='Developer ID Application: Your Name (TEAMID)'
./scripts/desktop-mac-sign.sh
```

Notarizer puis stapler:

```bash
export APPLE_ID='you@example.com'
export APPLE_TEAM_ID='TEAMID'
export APPLE_APP_PASSWORD='app-specific-password'
./scripts/desktop-mac-notarize.sh
```

## Prerequis

- Node.js 20+
- Rust toolchain (`rustup`, `cargo`)
- Tauri prerequis plateforme:
  - macOS: Xcode Command Line Tools
  - Linux: WebKitGTK + dependances Tauri
  - Windows: MSVC Build Tools

## Troubleshooting rapide

- Si `tauri dev` echoue sur un plugin opener:
  - verifier `src-tauri/Cargo.toml` contient `tauri-plugin-opener`.
  - verifier `src-tauri/src/main.rs` contient `.plugin(tauri_plugin_opener::init())`.
  - verifier `src-tauri/capabilities/default.json` contient `opener:default`.
- Si l'URL ne s'ouvre pas:
  - verifier `VITE_RESOLVER_BASE_URL` dans `.env`.
  - tester `GET <resolver>/api/resolver/resolve/<code>` manuellement.

## Flux utilisateur

1. L'utilisateur ouvre l'application.
2. Il entre un code d'invitation.
3. L'app appelle `GET /api/resolver/resolve/:code`.
4. Elle redirige vers `redirectTo` (serveur cible).
