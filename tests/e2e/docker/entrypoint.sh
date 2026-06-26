#!/usr/bin/env bash
set -euo pipefail

mkdir -p /home/codex/.ssh /home/codex/.codex /workspace
mkdir -p /home/codex/.local
chmod 700 /home/codex/.ssh
printf 'prefix=/home/codex/.local\n' >/home/codex/.npmrc
chown -R codex:"$(id -gn codex)" /home/codex/.ssh /home/codex/.local /home/codex/.npmrc
mkdir -p /home/codex/.codex/packages/standalone/current
ln -sf "$(command -v codex)" /home/codex/.codex/packages/standalone/current/codex

exec /usr/sbin/sshd -D -e
