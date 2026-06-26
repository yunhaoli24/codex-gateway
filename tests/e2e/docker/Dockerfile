FROM node:22-bookworm

ARG CODEX_CLI_VERSION=0.142.2
ARG E2E_UID=1000
ARG E2E_GID=1000

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssh-server git ca-certificates sudo \
  && rm -rf /var/lib/apt/lists/*

RUN npm install -g @openai/codex@${CODEX_CLI_VERSION}

RUN if ! getent group ${E2E_GID} >/dev/null; then groupadd --gid ${E2E_GID} codex; fi \
  && useradd --uid ${E2E_UID} --gid ${E2E_GID} --create-home --shell /bin/bash codex \
  && echo 'codex:codex' | chpasswd \
  && usermod -aG sudo codex \
  && mkdir -p /run/sshd

COPY entrypoint.sh /usr/local/bin/codex-e2e-entrypoint
RUN chmod +x /usr/local/bin/codex-e2e-entrypoint

EXPOSE 22
ENTRYPOINT ["/usr/local/bin/codex-e2e-entrypoint"]
