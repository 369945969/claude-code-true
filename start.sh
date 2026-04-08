#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

if ! command -v bun >/dev/null 2>&1; then
  echo "bun not found. Please install Bun: https://bun.sh" >&2
  exit 1
fi

if [ ! -d "node_modules" ]; then
  bun install
fi

exec bun run dev "$@"
