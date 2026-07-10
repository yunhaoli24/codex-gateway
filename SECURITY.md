# Security Policy

## Reporting a Vulnerability

Do not open a public issue for a suspected vulnerability. Use GitHub's private vulnerability reporting for this repository and include:

- The affected version or commit.
- Reproduction steps and the expected security impact.
- Relevant logs with credentials, tokens, hostnames, and private paths removed.
- Any suggested mitigation, if available.

Please allow a reasonable amount of time for validation and remediation before public disclosure.

## Scope

Security-sensitive areas include Bearer authentication, encrypted SQLite configuration, SSH credentials and channels, remote file access, terminal sessions, WebSocket authorization, and cross-user runtime isolation.
