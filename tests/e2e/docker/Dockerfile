FROM node:22-bookworm

ARG CODEX_CLI_VERSION=0.130.0
ARG E2E_UID=1000
ARG E2E_GID=1000

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssh-server git ca-certificates sudo \
  && rm -rf /var/lib/apt/lists/*

ENV E2E_NODE_DIR=/home/codex/.nvm/versions/node/v22.0.0

RUN npm install -g --prefix /tmp/codex-node @openai/codex@${CODEX_CLI_VERSION}

RUN if ! getent group ${E2E_GID} >/dev/null; then groupadd --gid ${E2E_GID} codex; fi \
  && useradd --uid ${E2E_UID} --gid ${E2E_GID} --create-home --shell /bin/bash codex \
  && echo 'codex:codex' | chpasswd \
  && usermod -aG sudo codex \
  && mkdir -p /run/sshd \
  && mkdir -p "$E2E_NODE_DIR" \
  && cp -a /tmp/codex-node/bin "$E2E_NODE_DIR/bin" \
  && cp -a /tmp/codex-node/lib "$E2E_NODE_DIR/lib" \
  && chown -R codex:"$(id -gn codex)" /home/codex/.nvm \
  && rm -rf /tmp/codex-node

COPY entrypoint.sh /usr/local/bin/codex-e2e-entrypoint
RUN chmod +x /usr/local/bin/codex-e2e-entrypoint

EXPOSE 22
ENTRYPOINT ["/usr/local/bin/codex-e2e-entrypoint"]
