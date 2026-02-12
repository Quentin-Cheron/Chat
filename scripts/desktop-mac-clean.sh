#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DESKTOP_DIR="$ROOT_DIR/desktop"
MODE="project"

if [[ "${1:-}" == "--all" ]]; then
  MODE="all"
fi

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "[clean] This script is for macOS only."
  exit 1
fi

echo "[clean] Removing desktop project artifacts..."
rm -rf "$DESKTOP_DIR/node_modules" \
       "$DESKTOP_DIR/dist" \
       "$DESKTOP_DIR/src-tauri/target" \
       "$DESKTOP_DIR/.env"

if [[ "$MODE" == "all" ]]; then
  echo "[clean] Removing global Rust toolchain (rustup self uninstall)..."
  if [[ -x "$HOME/.cargo/bin/rustup" ]]; then
    "$HOME/.cargo/bin/rustup" self uninstall -y || true
  fi

  if command -v brew >/dev/null 2>&1; then
    echo "[clean] Uninstalling brew packages installed for desktop setup (if present)..."
    brew uninstall --ignore-dependencies rustup-init || true
    brew uninstall --ignore-dependencies node || true
  fi

  echo "[clean] Global cleanup complete."
else
  echo "[clean] Project-only cleanup complete."
  echo "[clean] Use '--all' to also remove global installs (node/rustup toolchain)."
fi
