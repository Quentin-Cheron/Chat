#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_PATH="${1:-$ROOT_DIR/desktop/src-tauri/target/release/bundle/macos/PrivateChat Desktop.app}"
ZIP_PATH="${2:-$ROOT_DIR/desktop/src-tauri/target/release/bundle/macos/PrivateChat Desktop-notarize.zip}"

APPLE_ID="${APPLE_ID:-}"
APPLE_TEAM_ID="${APPLE_TEAM_ID:-}"
APPLE_APP_PASSWORD="${APPLE_APP_PASSWORD:-}"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "[notarize] macOS only"
  exit 1
fi

if [[ -z "$APPLE_ID" || -z "$APPLE_TEAM_ID" || -z "$APPLE_APP_PASSWORD" ]]; then
  echo "[notarize] Missing env vars. Set: APPLE_ID, APPLE_TEAM_ID, APPLE_APP_PASSWORD"
  exit 1
fi

if [[ ! -d "$APP_PATH" ]]; then
  echo "[notarize] App bundle not found: $APP_PATH"
  exit 1
fi

rm -f "$ZIP_PATH"
ditto -c -k --keepParent "$APP_PATH" "$ZIP_PATH"

echo "[notarize] Submitting to Apple..."
xcrun notarytool submit "$ZIP_PATH" \
  --apple-id "$APPLE_ID" \
  --team-id "$APPLE_TEAM_ID" \
  --password "$APPLE_APP_PASSWORD" \
  --wait

echo "[notarize] Stapling ticket..."
xcrun stapler staple "$APP_PATH"

echo "[notarize] Done."
