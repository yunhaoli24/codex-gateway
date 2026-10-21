# Contributing to Codex Gateway

Thanks for contributing. Codex Gateway is an integration layer around the official Codex app-server, so protocol fidelity and end-to-end behavior matter more than local mocks.

Architecture, persistence boundaries and deployment instructions are maintained in the [English README](README.md#architecture) and [中文 README](README.zh-CN.md#架构).

## Development Setup

```bash
git clone --recurse-submodules https://github.com/yunhaoli24/codex-gateway.git
cd codex-gateway
corepack enable
pnpm install
```

Use Node 24 and the pnpm version pinned in `package.json`. Export the same configuration for the development server and user creation script:

```bash
export CODEX_GATEWAY_CONFIG_SECRET="development-only-secret"
export CODEX_GATEWAY_DB_PATH="$PWD/data/codex-gateway.db"
pnpm user:create <username> <password>
pnpm dev
```

Installation builds and typechecks the workspace packages and prepares Nuxt. The user script creates or resets the named account; accounts have no separate administrator role.

## Code Boundaries

- `app/components/`, domain-specific `app/stores/` and `app/composables/` own business UI and browser state. Share utilities in the relevant domain rather than duplicating logic in components.
- `server/utils/gateway/agent/` owns the provider interface and Codex protocol mapping. Codex is currently the only implemented provider; adding a registry entry alone does not implement another agent.
- `runtime/` owns Host sessions, thread controllers, subscription leases and history. `infra/` owns SSH/SFTP, RPC, remote files/Git and installation. Preserve the existing shared connection lifecycle.
- `shared/runtime/` validates wire data; `shared/thread-history/` contains reusable history operations. Official timeline cursors and item identifiers must retain their semantics.
- `packages/gateway-ui/`, `packages/gateway-ai-elements/` and `packages/gateway-browser-runtime/` expose precompiled components/renderers. Import their public exports instead of reaching into their source from business code.
- `service-worker/` handles push and navigation, with its own TypeScript environment. It does not precache authenticated responses or Nuxt bundles.

## Git Workflow

- Check out a dedicated branch such as `feat/*` or `fix/*` before making any code change. If the current branch is already neither `main` nor `master`, keep using it instead of creating another branch.
- Never commit or push code changes directly to `main` or `master`. Use a branch, pull request, and review for all collaborative changes to avoid conflicts.

## Pull Requests

- Keep Codex app-server as the authoritative source for thread and turn state.
- Perform SSH authentication and remote runtime access on the server. Treat host/config responses and exports as sensitive; never put credentials in logs, test artifacts or committed fixtures.
- Route realtime browser interactions through the shared `/api/realtime` WebSocket.
- Scope runtime state and asynchronous callbacks to the authenticated Gateway user; preserve independent MFA and subscription lifecycles across users.
- Use App Server's timeline pagination and official start/steer/interrupt semantics. Keep presentation folding separate from transcript membership.
- Add visible UI text to both `i18n/locales/en.json` and `i18n/locales/zh.json`.
- Target the release in `server/utils/gateway/infra/codex/codex-version.ts`, including any experimental APIs used by Gateway. When upgrading it, align the submodule, protocol parsers and real upgrade fixtures together. Storage formats still returned by that release must remain readable.
- Do not modify `third_party/openai-codex` unless the change explicitly updates the supported official release.

## Validation

Run the type and lint checks for every code change:

```bash
pnpm lint
```

This checks business code, service-worker and E2E types, Oxlint rules and formatting. It does not build or separately typecheck workspace-package source. After changing a package, run:

```bash
pnpm build:dependencies
pnpm typecheck:dependencies
```

Changes involving SSH, RPC, WebSocket, threads, configuration, uploads or app-server protocol handling must pass the real containerized E2E suite. Rendering and mobile-layout changes need checks appropriate to their behavior; changes to scrolling, virtualization or state restoration need browser coverage:

```bash
pnpm test:e2e
```

The E2E suite builds production Nuxt and runs the app and browsers in separate containers. SSH targets cover standalone installation, npm migration and keyboard-interactive MFA. Configure a working Codex account/model for agent-output tests; a valid SSH fixture alone cannot generate model responses.

Prefer tests that operate through visible browser controls and real SSH/Codex behavior. Reuse existing cases for related assertions; do not manufacture a second WebSocket or mock protocol events to bypass the user path. Keep logs/traces useful on failure and remove temporary diagnostics after investigation.

For documentation-only changes, verify commands, links, bilingual consistency and `git diff --check`; a production build or E2E run is unnecessary. Include what was verified and any remaining limitations in the PR.
