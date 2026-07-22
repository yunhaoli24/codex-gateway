FROM node:22-bookworm AS preview-dependencies

RUN npm install --prefix /tmp/preview ws@8.21.0

FROM node:14.21.3-bullseye-slim AS legacy-node-runtime

FROM node:22.23.1-bookworm-slim AS legacy-codex-runtime

ARG CODEX_CLI_VERSION=0.140.0
RUN mkdir -p /tmp/codex-node \
  && cp -a /usr/local/. /tmp/codex-node/ \
  && npm install -g --prefix /tmp/codex-node @openai/codex@${CODEX_CLI_VERSION}

FROM debian:bookworm-slim AS ssh-base

ARG E2E_UID=1000
ARG E2E_GID=1000

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssh-server git ca-certificates sudo tmux \
  && rm -rf /var/lib/apt/lists/*

RUN groupadd --gid ${E2E_GID} codex \
  && useradd --uid ${E2E_UID} --gid ${E2E_GID} --create-home --shell /bin/bash codex \
  && echo 'codex:codex' | chpasswd \
  && usermod -aG sudo codex \
  && mkdir -p /run/sshd

COPY entrypoint.sh /usr/local/bin/codex-e2e-entrypoint
COPY preview-server.mjs /usr/local/lib/codex-preview-server.mjs
COPY --from=preview-dependencies /tmp/preview/node_modules /usr/local/lib/node_modules
RUN chmod +x /usr/local/bin/codex-e2e-entrypoint

EXPOSE 22
ENTRYPOINT ["/usr/local/bin/codex-e2e-entrypoint"]

FROM ssh-base AS empty-runtime

FROM ssh-base AS legacy-node
COPY --from=legacy-node-runtime /usr/local/ /usr/local/

FROM ssh-base AS legacy-codex
ARG E2E_UID=1000
ARG E2E_GID=1000
ENV E2E_NODE_DIR=/home/codex/.nvm/versions/node/v22.23.1
COPY --from=legacy-codex-runtime /tmp/codex-node/ ${E2E_NODE_DIR}/
RUN chown -R ${E2E_UID}:${E2E_GID} /home/codex/.nvm
