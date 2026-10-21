# Security Policy

## Reporting a Vulnerability

Do not open a public issue for a suspected vulnerability. Use GitHub's private vulnerability reporting for this repository and include:

- The affected version or commit.
- Reproduction steps and the expected security impact.
- Relevant logs with credentials, tokens, hostnames, and private paths removed.
- Any suggested mitigation, if available.

Please allow a reasonable amount of time for validation and remediation before public disclosure.

## Scope

Security-sensitive areas include Bearer authentication, encrypted SQLite configuration, SSH/MFA credentials and channels, remote files and attachments, terminal sessions, WebSocket authorization, preview origins, push subscriptions, and cross-user runtime isolation.

## Trust Boundaries

- Gateway users manage their own Host configuration, pins and notification settings. Runtime caches, subscriptions and MFA challenges are user-scoped. Gateway accounts do not sandbox a shared remote SSH account: the same SSH user and `CODEX_HOME` expose the same remote files and Codex threads.
- SSH authentication and remote access execute on the Gateway server. Host settings and configuration exports may contain credentials; treat the authenticated browser, exports and backups as trusted access to those secrets. Remote Codex credentials remain in the remote Codex environment.
- SQLite configuration, Web Push subscriptions and VAPID keys are encrypted with a key derived from `CODEX_GATEWAY_CONFIG_SECRET`. Passwords use Argon2id and session tokens are stored as hashes. A database backup still contains sensitive metadata and must be protected; encryption does not replace filesystem permissions or HTTPS.
- Browser login tokens grant access to that account's remote capabilities, including shells and file writes. Logout revokes the session and its Web Push subscription. MFA codes are transient answers to SSH challenges, not reusable stored host credentials.
- Preview applications execute in isolated `p-<hmac>` origins. Preserve their Host headers and WebSocket upgrades, configure wildcard TLS, and keep upstream frame/security policies intact. A preview grants access to a target reachable by the selected SSH Host; it is not a public tunnel to publish without authentication.
- Uploaded attachments are files in the remote Codex home. Removing `thread/attachment/*` membership does not delete those bytes or remove references from historical messages. Include remote attachments in the remote account's retention and backup policy.
- Notifications may carry conversation or task details to the user's Web Push/Bark provider. Provider acceptance indicates delivery was accepted, not that the device displayed it. Keep subscription endpoints, device keys and payloads out of public diagnostics.

## Operating a Shared Deployment

Serve Gateway behind HTTPS with WebSocket support. Keep the data volume, configuration secret and backups private, and create accounts only for users trusted with their configured SSH permissions. The current runtime is a single Gateway process; deploying multiple replicas does not synchronize its in-memory connections or pending MFA.

Codex upgrade archives are verified against release SHA-256 metadata and sent through SFTP. Official daemon lifecycle commands control shutdown and best-effort recovery. Review upgrade/restart impact on active work; do not solve socket ownership errors by broadly killing unrelated Codex processes.

The architecture and backup requirements are documented in [README.md](README.md#architecture) and [README.zh-CN.md](README.zh-CN.md#架构).
