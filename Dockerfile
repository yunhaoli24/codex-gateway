# syntax=docker/dockerfile:1.7

ARG NODE_VERSION=24-bookworm-slim

FROM node:${NODE_VERSION} AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app

FROM base AS deps
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
# Keep precompiled browser packages in the dependency layer. Their Office, Markdown, UI, and AI
# dependency graphs change far less often than the Nuxt app, so normal edits reuse this layer.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY patches ./patches
COPY packages ./packages
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --reporter=silent

FROM deps AS build
COPY i18n ./i18n
COPY components.json nuxt.config.ts tailwind.config.ts tsconfig.json ./
COPY public ./public
COPY scripts ./scripts
COPY shared ./shared
COPY server ./server
COPY app ./app
# Reuse precompiled packages from the deps layer. Nuxt 4.6 includes the former renderer-cache
# fixes; application sources stay in this separate layer so an edit rebuilds the app bundle.
RUN pnpm exec nuxt build --logLevel silent

FROM node:${NODE_VERSION} AS runner
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates tini \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app/.output ./.output
COPY --from=build /app/scripts ./scripts
EXPOSE 3000
ENTRYPOINT ["/usr/bin/tini", "--"]
# The 1 GiB container also hosts SSH/TLS/native buffers. Keep V8 old-space bounded to leave room
# for those allocations, and expose GC only for Nitro's five-minute housekeeping service.
CMD ["node", "--expose-gc", "--max-old-space-size=512", ".output/server/index.mjs"]
