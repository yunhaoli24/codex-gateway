export function codexRemotePayload(command: string) {
  return [
    'printf \'%b\' \'\\254\\341\\117\\004\\120\\367\\316\\361\' >/dev/null;',
    'PATH="${CODEX_INSTALL_DIR:-$HOME/.local/bin}:$PATH"; export PATH;',
    command,
  ].join(' ')
}

export function codexRemoteAppServerStartPayload() {
  return codexRemotePayload([
    'codex app-server --listen unix://',
  ].join(' '))
}

export function codexRemoteAppServerProxyPayload() {
  return codexRemotePayload(`
set -eu
state_dir="\${CODEX_HOME:-$HOME/.codex}/app-server-gateway"
socket="\${CODEX_HOME:-$HOME/.codex}/app-server-control/app-server-control.sock"
mkdir -p "$state_dir"
if ! [ -S "$socket" ]; then
  nohup codex app-server --listen unix:// >"$state_dir/app-server.log" 2>&1 </dev/null &
  for i in $(seq 1 100); do
    if [ -S "$socket" ]; then
      break
    fi
    sleep 0.1
  done
fi
[ -S "$socket" ]
exec codex app-server proxy
`)
}

export function codexRemoteAppServerExistingProxyPayload() {
  return codexRemotePayload('codex app-server proxy')
}

export function codexRemoteAppServerDaemonVersionPayload() {
  return codexRemotePayload('codex app-server daemon version')
}

export function codexRemoteVersionPayload() {
  return codexRemotePayload('codex --version')
}

export function codexRemoteUpgradeAndRestartPayload() {
  return codexRemotePayload([
    'npm install -g @openai/codex',
    'codex --version',
  ].join(' && '))
}

export function codexRemoteStopManagedAppServerPayload() {
  return codexRemotePayload('codex app-server daemon stop >/dev/null')
}

export function codexRemoteTerminateUnmanagedAppServerPayload() {
  return codexRemotePayload(`
set -eu
socket="\${CODEX_HOME:-$HOME/.codex}/app-server-control/app-server-control.sock"
if [ ! -S "$socket" ]; then
  exit 0
fi
pid=""
if command -v ss >/dev/null 2>&1; then
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
    'codex --version',
    'codex app-server proxy --help >/dev/null',
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
    '*) exec "$SHELL" -l -i -c \'exec /bin/sh -c "$CODEX_REMOTE_PAYLOAD"\' ;;',
    'esac',
  ].join(' ')

  return `sh -c ${shellQuote(wrapper)} sh ${shellQuote(payload)}`
}

function shellQuote(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`
}
