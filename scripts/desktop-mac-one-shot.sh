#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DESKTOP_DIR="$ROOT_DIR/desktop"
APP_NAME="PrivateChat Desktop.app"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "[desktop] This script is for macOS only."
  exit 1
fi

if ! command -v brew >/dev/null 2>&1; then
  echo "[desktop] Homebrew is required. Install from https://brew.sh then retry."
  exit 1
fi

echo "[desktop] Installing/verifying dependencies..."
if ! command -v node >/dev/null 2>&1; then
  brew install node
fi

if ! command -v rustup-init >/dev/null 2>&1; then
  brew install rustup-init
fi

if [[ ! -x "$HOME/.cargo/bin/cargo" ]]; then
  echo "[desktop] Installing Rust toolchain..."
  rustup-init -y
fi

# shellcheck disable=SC1090
source "$HOME/.cargo/env"

if ! xcode-select -p >/dev/null 2>&1; then
  echo "[desktop] Installing Xcode Command Line Tools..."
  xcode-select --install || true
  echo "[desktop] Complete Xcode installation if prompted, then rerun this script."
  exit 1
fi

if [[ ! -f "$DESKTOP_DIR/.env" && -f "$DESKTOP_DIR/.env.example" ]]; then
  cp "$DESKTOP_DIR/.env.example" "$DESKTOP_DIR/.env"
  echo "[desktop] Created desktop/.env from .env.example"
fi

echo "[desktop] Building desktop app..."
cd "$DESKTOP_DIR"
npm install
npm run tauri build

APP_PATH=""
BINARY_PATH="$DESKTOP_DIR/src-tauri/target/release/privatechat-desktop"
for candidate in \
  "$DESKTOP_DIR/src-tauri/target/release/bundle/macos/$APP_NAME" \
  "$DESKTOP_DIR/src-tauri/target/aarch64-apple-darwin/release/bundle/macos/$APP_NAME" \
  "$DESKTOP_DIR/src-tauri/target/x86_64-apple-darwin/release/bundle/macos/$APP_NAME"; do
  if [[ -d "$candidate" ]]; then
    APP_PATH="$candidate"
    break
  fi
done

if [[ -n "$APP_PATH" ]]; then
  EXECUTABLE_PATH="$APP_PATH/Contents/MacOS/PrivateChat Desktop"
  if [[ -x "$EXECUTABLE_PATH" ]]; then
    echo "[desktop] Opening app bundle: $APP_PATH"
    open "$APP_PATH"
    echo "[desktop] Done."
    exit 0
  fi
  echo "[desktop] Bundle found but executable missing, fallback to binary."
fi

if [[ -x "$BINARY_PATH" ]]; then
  echo "[desktop] Bundle disabled/not found. Launching binary: $BINARY_PATH"
  "$BINARY_PATH" >/tmp/privatechat-desktop.log 2>&1 &
  echo "[desktop] Started. Logs: /tmp/privatechat-desktop.log"
  exit 0
fi

echo "[desktop] Build finished, but no runnable output found."
echo "[desktop] Expected either:"
echo "  - $DESKTOP_DIR/src-tauri/target/**/bundle/macos/$APP_NAME"
echo "  - $BINARY_PATH"
exit 1
