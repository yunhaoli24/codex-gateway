# Contributing to Codex Gateway

Thanks for contributing. Codex Gateway is an integration layer around the official Codex app-server, so protocol fidelity and end-to-end behavior matter more than local mocks.

## Development Setup

```bash
git clone --recurse-submodules https://github.com/yunhaoli24/codex-gateway.git
cd codex-gateway
pnpm install
pnpm dev
```

Create a local user with a stable config secret and database path:

```bash
CODEX_GATEWAY_CONFIG_SECRET="development-only-secret" \
CODEX_GATEWAY_DB_PATH="./data/codex-gateway.db" \
pnpm user:create <username> <password>
```

## Git Workflow

- Check out a dedicated branch such as `feat/*` or `fix/*` before making any code change. If the current branch is already neither `main` nor `master`, keep using it instead of creating another branch.
- Never commit or push code changes directly to `main` or `master`. Use a branch, pull request, and review for all collaborative changes to avoid conflicts.

## Pull Requests

- Keep Codex app-server as the authoritative source for thread and turn state.
- Keep SSH credentials, Codex credentials, and remote runtime access on the server.
- Route realtime browser interactions through the shared `/api/realtime` WebSocket.
- Add visible UI text to both `i18n/locales/en.json` and `i18n/locales/zh.json`.
- Do not add compatibility branches for old Codex protocols.
- Do not modify `third_party/openai-codex` unless the change explicitly updates the supported official release.

## Validation

Run the type and lint checks for every code change:

```bash
pnpm lint
```

Changes involving SSH, RPC, WebSocket, threads, configuration, uploads, rendering, mobile layout, or app-server protocol handling must pass the real containerized E2E suite:

```bash
pnpm test:e2e
```

The E2E suite uses a real Nuxt build, a real SSH target, and a real Codex app-server. Do not replace these paths with mocks.
