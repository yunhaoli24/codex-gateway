#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ -f "${ROOT_DIR}/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "${ROOT_DIR}/.env"
  set +a
fi

REMOTE_HOST="${REMOTE_HOST:-152.53.52.210}"
REMOTE_USER="${REMOTE_USER:-root}"
REMOTE_DIR="${REMOTE_DIR:-/root/docker/codex-gateway}"
REMOTE_PORT="${REMOTE_PORT:-22}"

SSH_ARGS=(
  -p "$REMOTE_PORT"
  -o StrictHostKeyChecking=accept-new
)

RSYNC_RSH=(ssh "${SSH_ARGS[@]}")
if [[ -n "${REMOTE_PASSWORD:-}" ]]; then
  if ! command -v sshpass >/dev/null 2>&1; then
    echo "REMOTE_PASSWORD is set but sshpass is not installed." >&2
    exit 1
  fi
  RSYNC_RSH=(sshpass -e ssh "${SSH_ARGS[@]}")
  export SSHPASS="$REMOTE_PASSWORD"
fi

echo "Syncing git metadata from ${ROOT_DIR}/ to ${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}"

"${RSYNC_RSH[@]}" "${REMOTE_USER}@${REMOTE_HOST}" "
set -e
if ! command -v rsync >/dev/null 2>&1 || ! command -v git >/dev/null 2>&1; then
  if ! command -v apt-get >/dev/null 2>&1; then
    echo 'Remote host is missing rsync/git and apt-get is not available.' >&2
    exit 1
  fi
  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get install -y rsync git
fi
mkdir -p '$REMOTE_DIR'
"

rsync -az --delete \
  -e "${RSYNC_RSH[*]}" \
  "${ROOT_DIR}/.git/" \
  "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}/.git/"

if [[ -f "${ROOT_DIR}/.gitmodules" ]]; then
  rsync -az \
    -e "${RSYNC_RSH[*]}" \
    "${ROOT_DIR}/.gitmodules" \
    "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}/.gitmodules"
fi

if [[ -f "${ROOT_DIR}/third_party/openai-codex/.git" ]]; then
  "${RSYNC_RSH[@]}" "${REMOTE_USER}@${REMOTE_HOST}" "mkdir -p '$REMOTE_DIR/third_party/openai-codex'"
  rsync -az \
    -e "${RSYNC_RSH[*]}" \
    "${ROOT_DIR}/third_party/openai-codex/.git" \
    "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}/third_party/openai-codex/.git"
fi

"${RSYNC_RSH[@]}" "${REMOTE_USER}@${REMOTE_HOST}" "git config --global --add safe.directory '$REMOTE_DIR' && cd '$REMOTE_DIR' && git reset --hard HEAD && git clean -fdx && git submodule update --init --recursive"

echo "Sync and checkout complete."
