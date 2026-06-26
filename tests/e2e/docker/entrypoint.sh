#!/usr/bin/env bash
set -euo pipefail

mkdir -p /home/codex/.ssh /home/codex/.codex /workspace
chmod 700 /home/codex/.ssh
chown -R codex:"$(id -gn codex)" /home/codex/.ssh
mkdir -p /home/codex/.codex/packages/standalone/current
ln -sf "$(command -v codex)" /home/codex/.codex/packages/standalone/current/codex

exec /usr/sbin/sshd -D -e
