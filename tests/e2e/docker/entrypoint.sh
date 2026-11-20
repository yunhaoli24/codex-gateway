#!/usr/bin/env bash
set -euo pipefail

# The checkout may belong to a different host UID (including root). Never chown or write to
# the bind mount: each SSH host gets an independent writable snapshot of current sources.
# Keep it across container restarts, which are part of the SSH interruption scenarios.
workspace=/workspace/codex-gateway
workspace_marker=/var/lib/codex-e2e/workspace-initialized
if [ ! -f "$workspace_marker" ]; then
  mkdir -p "$workspace" "$(dirname "$workspace_marker")"
  tar -C /workspace/source \
    --exclude='./node_modules' --exclude='*/node_modules' \
    --exclude='./.nuxt' --exclude='./.output' --exclude='./.nitro' \
    --exclude='./.cache' --exclude='./.turbo' --exclude='*/.turbo' \
    --exclude='./.data' --exclude='./.data-e2e' --exclude='./.e2e-runtime' \
    --exclude='./test-results' --exclude='./playwright-report' --exclude='./logs' \
    --exclude='./third_party' --exclude='./.env' --exclude='./.env.*' \
    -cf - . | tar -C "$workspace" -xf -
  chown -hR codex:"$(id -gn codex)" "$workspace"
  touch "$workspace_marker"
fi

# Fail at fixture startup rather than timing out later waiting for a real Codex command.
if ! runuser -u codex -- sh -eu -c '
  cd "$1"
  probe=$(mktemp -d .e2e-write-check.XXXXXX)
  rmdir "$probe"
  unshare -Ur true
' sh "$workspace"; then
  echo 'SSH fixture requires a writable workspace and unprivileged user namespaces; check the E2E Compose security profiles.' >&2
  exit 1
fi

mkdir -p /home/codex/.ssh /home/codex/.codex /workspace
mkdir -p /home/codex/.local
chmod 700 /home/codex/.ssh
chown -R codex:"$(id -gn codex)" /home/codex/.ssh /home/codex/.local /home/codex/.codex

if [ -x /usr/local/bin/e2e-gpu-training ]; then
  runuser -u trainer -- /usr/local/bin/e2e-gpu-training >/dev/null 2>&1 &
fi

exec /usr/sbin/sshd -D -e
