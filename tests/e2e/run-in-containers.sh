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

export E2E_UID="${E2E_UID:-12345}"
export E2E_GID="${E2E_GID:-12345}"
export E2E_CODEX_HOME="${E2E_CODEX_HOME:-$HOME/.codex}"
# Keep the MFA fixture on the same Codex version as the application protocol gate. The dedicated
# legacy fixtures own upgrade coverage; mixing a 130 MB upgrade into the MFA browser flow makes
# authentication timing depend on installation work that the test is not exercising.
export E2E_SUPPORTED_CODEX_VERSION="$(
  node --experimental-strip-types --input-type=module -e \
    "import('./server/utils/gateway/infra/codex/codex-version.ts').then(({ SUPPORTED_CODEX_VERSION }) => process.stdout.write(SUPPORTED_CODEX_VERSION))"
)"

cleanup() {
  status=$?
  if [ "$status" -ne 0 ]; then
    docker compose -p "$project_name" -f "$compose_file" logs --no-color \
      gateway-under-test ssh-target ssh-target-legacy-node ssh-target-legacy-codex \
      ssh-target-mfa >&2 || true
  fi
  docker compose -p "$project_name" -f "$compose_file" down --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker compose -p "$project_name" -f "$compose_file" build \
  build-runner ssh-target ssh-target-legacy-node ssh-target-legacy-codex ssh-target-mfa
# Build, application server, and browser runner use separate 2 GiB cgroups. Sharing only the
# gateway network namespace preserves the production-like nip.io subdomain routing used by browser
# preview tests without coupling process memory.
docker compose -p "$project_name" -f "$compose_file" run --rm build-runner \
  bash -lc 'rm -rf .output .nuxt .data-e2e/* /e2e-output/* && pnpm exec nuxt build --extends ./tests/e2e/nuxt-layer && cp -a .output/. /e2e-output/ && node scripts/create-user.mjs "$E2E_GATEWAY_USERNAME" "$E2E_GATEWAY_PASSWORD"'
docker compose -p "$project_name" -f "$compose_file" up -d --wait \
  gateway-under-test browser-preview-ingress
docker compose -p "$project_name" -f "$compose_file" run --rm test-runner \
  bash -lc 'exec pnpm exec playwright test "$@"' \
  e2e "$@"
