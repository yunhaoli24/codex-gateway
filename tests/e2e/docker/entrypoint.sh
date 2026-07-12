#!/usr/bin/env bash
set -euo pipefail

mkdir -p /home/codex/.ssh /home/codex/.codex /workspace
mkdir -p /home/codex/.local
chmod 700 /home/codex/.ssh
printf 'prefix=/home/codex/.nvm/versions/node/v22.0.0\n' >/home/codex/.npmrc
chown -R codex:"$(id -gn codex)" /home/codex/.ssh /home/codex/.local /home/codex/.codex /home/codex/.npmrc

NODE_PATH="$E2E_NODE_DIR/lib/node_modules" node /usr/local/lib/codex-preview-server.mjs &

exec /usr/sbin/sshd -D -e
