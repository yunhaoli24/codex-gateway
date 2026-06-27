#!/usr/bin/env bash
set -euo pipefail

source_dir="${E2E_SOURCE_DIR:-/workspace/source}"
work_dir="/workspace/codex-gateway"

copy_entry() {
  local entry="$1"
  rm -rf "$work_dir/$entry"
  cp -a "$source_dir/$entry" "$work_dir/$entry"
}

for entry in app i18n public server shared tests components.json nuxt.config.ts package.json playwright.config.ts pnpm-lock.yaml pnpm-workspace.yaml tailwind.config.ts tsconfig.json; do
  if [ -e "$source_dir/$entry" ]; then
    copy_entry "$entry"
  fi
done

exec "$@"
