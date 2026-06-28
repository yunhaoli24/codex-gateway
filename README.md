# Codex Gateway

Nuxt 4 + TypeScript gateway for controlling remote Codex app-server sessions over SSH.

## Scope

- Single user, single gateway process.
- Browser talks only to Nuxt server APIs and SSE.
- Gateway connects to remote hosts with Node `ssh2`.
- Remote Codex state stays in app-server/thread history.
- Host/project config is synced from the browser's Pinia/localStorage state.
- The Nuxt server keeps only an in-memory runtime index for recently seen threads and gateway events.

## Commands

```bash
pnpm install
pnpm dev
pnpm typecheck
pnpm test:e2e
pnpm build
```

## Current MVP

- Add SSH hosts using ssh-agent or a private key path.
- Verify a host by running `codex --version` and checking `codex app-server`.
- Add remote project directories.
- List Codex threads with `thread/list`.
- Start or resume threads with `thread/start` and `thread/resume`.
- Send turns with `turn/start`.
- Broadcast app-server notifications to all browser tabs via SSE.
- Desktop-inspired web layout with Chinese as the default UI language and an English switcher.

## E2E

`pnpm test:e2e` starts:

1. Nuxt dev server on `http://127.0.0.1:3100`.
2. Local `codex app-server --listen ws://127.0.0.1:<port>`.
3. Chromium via Playwright.

The default suite verifies the real local app-server connection, host verification, project creation, thread listing/start flow, and language switching. It does not send a real model turn by default. Use this only when you intentionally want a real Codex turn:

```bash
pnpm test:e2e:turn
```

## Notes

The app-server API is experimental. This repository keeps the generated protocol schema in `.codex-app-server-schema` for the Codex CLI version used during scaffolding, while the gateway code intentionally uses narrow DTOs and passes raw app-server payloads through to the UI.
