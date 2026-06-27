#!/usr/bin/env bash
set -euo pipefail

mkdir -p /home/codex/.ssh /home/codex/.codex /workspace
mkdir -p /home/codex/.local
chmod 700 /home/codex/.ssh
printf 'prefix=/home/codex/.nvm/versions/node/v22.0.0\n' >/home/codex/.npmrc
mkdir -p /home/codex/.codex/packages/standalone/current
ln -sf /home/codex/.nvm/versions/node/v22.0.0/bin/codex /home/codex/.codex/packages/standalone/current/codex
chown -R codex:"$(id -gn codex)" /home/codex/.ssh /home/codex/.local /home/codex/.codex /home/codex/.npmrc

exec /usr/sbin/sshd -D -e
