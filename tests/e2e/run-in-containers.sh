#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
project_dir="$(cd "$script_dir/../.." && pwd)"
compose_file="$script_dir/docker-compose.yml"
project_name="${E2E_COMPOSE_PROJECT_NAME:-codex-gateway-e2e}"

if [ "${1:-}" = "--turn" ]; then
  export E2E_CODEX_TURN=1
  shift
fi

if [ "${1:-}" = "--" ]; then
  shift
fi

uid_value="$(id -u)"
gid_value="$(id -g)"
export E2E_UID="${E2E_UID:-$uid_value}"
export E2E_GID="${E2E_GID:-$gid_value}"
export E2E_CODEX_HOME="${E2E_CODEX_HOME:-$HOME/.codex}"

cleanup() {
  docker compose -p "$project_name" -f "$compose_file" down --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker compose -p "$project_name" -f "$compose_file" build
docker compose -p "$project_name" -f "$compose_file" run --rm test-runner \
  pnpm exec playwright test "$@"
