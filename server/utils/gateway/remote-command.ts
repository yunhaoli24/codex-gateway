export function codexRemotePayload(command: string) {
  return [
    'printf \'%b\' \'\\254\\341\\117\\004\\120\\367\\316\\361\' >/dev/null;',
    codexPathBootstrap(),
    command,
  ].join(' ')
}

function codexPathBootstrap() {
  return [
    'for dir in "${CODEX_INSTALL_DIR:-$HOME/.local/bin}" "$HOME/.local/bin" "$HOME/.npm-global/bin" "$HOME/.bun/bin" "$HOME/.nvm/current/bin" "$HOME/.nvm/versions/node"/*/bin /usr/local/bin /usr/bin /opt/homebrew/bin /opt/node/bin; do if [ -d "$dir" ]; then PATH="$dir:$PATH"; fi; done; export PATH;',
    'CODEX_BIN="$(command -v codex 2>/dev/null || true)";',
    'if [ -z "$CODEX_BIN" ] && [ -x "${CODEX_INSTALL_DIR:-$HOME/.local/bin}/codex" ]; then CODEX_BIN="${CODEX_INSTALL_DIR:-$HOME/.local/bin}/codex"; fi;',
    'if [ -z "$CODEX_BIN" ] && command -v npm >/dev/null 2>&1; then NPM_PREFIX="$(npm prefix -g 2>/dev/null || true)"; if [ -n "$NPM_PREFIX" ] && [ -x "$NPM_PREFIX/bin/codex" ]; then CODEX_BIN="$NPM_PREFIX/bin/codex"; fi; fi;',
    'if [ -z "$CODEX_BIN" ] && command -v npm >/dev/null 2>&1; then NPM_ROOT="$(npm root -g 2>/dev/null || true)"; if [ -n "$NPM_ROOT" ] && [ -x "$NPM_ROOT/.bin/codex" ]; then CODEX_BIN="$NPM_ROOT/.bin/codex"; fi; fi;',
    'if [ -z "$CODEX_BIN" ]; then echo "codex executable not found. Install @openai/codex or set CODEX_INSTALL_DIR to the directory containing codex." >&2; exit 127; fi;',
    'export CODEX_BIN;',
  ].join(' ')
}

export function codexRemoteAppServerStartPayload() {
  return codexRemotePayload([
    '"$CODEX_BIN" app-server --listen unix://',
  ].join(' '))
}

export function codexRemoteAppServerProxyPayload() {
  return codexRemotePayload(`
set -eu
socket="\${CODEX_HOME:-$HOME/.codex}/app-server-control/app-server-control.sock"
if ! [ -S "$socket" ]; then
  codex_home="\${CODEX_HOME:-$HOME/.codex}"
  managed_codex="$codex_home/packages/standalone/current/codex"
  mkdir -p "$(dirname "$managed_codex")"
  ln -sf "$CODEX_BIN" "$managed_codex"
  "$CODEX_BIN" app-server daemon start >/dev/null
fi
[ -S "$socket" ]
exec "$CODEX_BIN" app-server proxy
`)
}

export function codexRemoteAppServerExistingProxyPayload() {
  return codexRemotePayload('"$CODEX_BIN" app-server proxy')
}

export function codexRemoteAppServerDaemonVersionPayload() {
  return codexRemotePayload('"$CODEX_BIN" app-server daemon version')
}

export function codexRemoteVersionPayload() {
  return codexRemotePayload('"$CODEX_BIN" --version')
}

export function codexRemoteUpgradeAndRestartPayload(version: string) {
  return codexRemotePayload(`
set -eu
npm install -g @openai/codex@${shellQuote(version)}
codex_home="\${CODEX_HOME:-$HOME/.codex}"
managed_codex="$codex_home/packages/standalone/current/codex"
mkdir -p "$(dirname "$managed_codex")"
for dir in "\${CODEX_INSTALL_DIR:-$HOME/.local/bin}" "$HOME/.local/bin" "$HOME/.npm-global/bin" "$HOME/.bun/bin" "$HOME/.nvm/current/bin" "$HOME/.nvm/versions/node"/*/bin /usr/local/bin /usr/bin /opt/homebrew/bin /opt/node/bin; do
  if [ -d "$dir" ]; then
    PATH="$dir:$PATH"
  fi
done
export PATH
CODEX_BIN="$(command -v codex 2>/dev/null || true)"
if [ -z "$CODEX_BIN" ] && [ -x "\${CODEX_INSTALL_DIR:-$HOME/.local/bin}/codex" ]; then
  CODEX_BIN="\${CODEX_INSTALL_DIR:-$HOME/.local/bin}/codex"
fi
if [ -z "$CODEX_BIN" ]; then
  NPM_PREFIX="$(npm prefix -g 2>/dev/null || true)"
  if [ -n "$NPM_PREFIX" ] && [ -x "$NPM_PREFIX/bin/codex" ]; then
    CODEX_BIN="$NPM_PREFIX/bin/codex"
  fi
fi
if [ -z "$CODEX_BIN" ]; then
  NPM_ROOT="$(npm root -g 2>/dev/null || true)"
  if [ -n "$NPM_ROOT" ] && [ -x "$NPM_ROOT/.bin/codex" ]; then
    CODEX_BIN="$NPM_ROOT/.bin/codex"
  fi
fi
if [ -z "$CODEX_BIN" ]; then
  echo "codex executable not found after npm install" >&2
  exit 127
fi
ln -sf "$CODEX_BIN" "$managed_codex"
"$CODEX_BIN" --version
`)
}

export function codexRemoteStopManagedAppServerPayload() {
  return codexRemotePayload('"$CODEX_BIN" app-server daemon stop >/dev/null')
}

export function codexRemoteTerminateUnmanagedAppServerPayload() {
  return codexRemotePayload(`
set -eu
socket="\${CODEX_HOME:-$HOME/.codex}/app-server-control/app-server-control.sock"
if [ ! -S "$socket" ]; then
  exit 0
fi
pid=""
inode=""
if [ -r /proc/net/unix ]; then
  inode="$(awk -v socket="$socket" '$NF == socket { print $7; exit }' /proc/net/unix)"
fi
if [ -n "$inode" ]; then
  for fd in /proc/[0-9]*/fd/*; do
    target="$(readlink "$fd" 2>/dev/null || true)"
    if [ "$target" = "socket:[$inode]" ]; then
      pid="\${fd#/proc/}"
      pid="\${pid%%/*}"
      break
    fi
  done
fi
if [ -z "$pid" ] && command -v ss >/dev/null 2>&1; then
  pid="$(ss -xlpH 2>/dev/null | awk -v socket="$socket" '
    index($0, socket) {
      if (match($0, /pid=[0-9]+/)) {
        print substr($0, RSTART + 4, RLENGTH - 4)
        exit
      }
    }
  ')"
fi
if [ -z "$pid" ] && command -v fuser >/dev/null 2>&1; then
  pid="$(fuser "$socket" 2>/dev/null | tr ' ' '\\n' | sed '/^$/d' | head -n 1 || true)"
fi
if [ -z "$pid" ]; then
  echo "Unable to identify unmanaged app-server PID for $socket" >&2
  exit 1
fi
kill -TERM "$pid"
for i in $(seq 1 100); do
  if [ ! -S "$socket" ] || ! kill -0 "$pid" 2>/dev/null; then
    exit 0
  fi
  sleep 0.1
done
if [ -S "$socket" ]; then
  echo "Unmanaged app-server did not stop after SIGTERM: $pid" >&2
  exit 1
fi
`)
}

export function codexRemoteAppServerVerifyPayload() {
  return codexRemotePayload([
    '"$CODEX_BIN" --version',
    '"$CODEX_BIN" app-server proxy --help >/dev/null',
  ].join(' && '))
}

export function remoteLoginShellCommand(payload: string) {
  const wrapper = [
    'if [ -z "$SHELL" ] || [ ! -x "$SHELL" ]; then',
    'echo "Codex remote SSH requires SHELL to point to an executable login shell" >&2; exit 127;',
    'fi;',
    'CODEX_REMOTE_PAYLOAD="$1"; export CODEX_REMOTE_PAYLOAD;',
    'case "${SHELL##*/}" in',
    'csh|tcsh) exec "$SHELL" -i -c \'set loginsh=1; if ( -r /etc/csh.login ) source /etc/csh.login; if ( -r ~/.login ) source ~/.login; exec /bin/sh -c "$CODEX_REMOTE_PAYLOAD"\' ;;',
    'nu) exec "$SHELL" -l -i -c \'exec /bin/sh -c $env.CODEX_REMOTE_PAYLOAD\' ;;',
    '*) exec "$SHELL" -l -c \'exec /bin/sh -c "$CODEX_REMOTE_PAYLOAD"\' ;;',
    'esac',
  ].join(' ')

  return `sh -c ${shellQuote(wrapper)} sh ${shellQuote(payload)}`
}

function shellQuote(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`
}
