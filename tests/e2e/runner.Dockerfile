FROM mcr.microsoft.com/playwright:v1.64.1-noble

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ git openssh-client ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable

WORKDIR /workspace/codex-gateway

# Turbo's task graph and workspace package sources are dependency inputs, not application inputs.
# Copy them before the mutable app tree so ordinary UI edits reuse pnpm and prebuilt vendor layers.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages ./packages
RUN --mount=type=cache,id=codex-gateway-e2e-pnpm-store,target=/pnpm/store \
  pnpm install --frozen-lockfile

COPY . /workspace/source

COPY tests/e2e/runner-entrypoint.sh /usr/local/bin/codex-gateway-e2e-runner
RUN chmod +x /usr/local/bin/codex-gateway-e2e-runner

ENTRYPOINT ["codex-gateway-e2e-runner"]
