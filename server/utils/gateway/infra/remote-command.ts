import { shellQuote } from "./shell";

export function codexRemotePayload(command: string) {
  return codexRemoteBootstrapPayload(command, { requireCodex: true });
}

export function codexRemoteBootstrapPayload(command: string, options: { requireCodex: boolean }) {
  return [
    "printf '%b' '\\254\\341\\117\\004\\120\\367\\316\\361' >/dev/null;",
    codexPathBootstrap(options),
    command,
  ].join(" ");
}

function codexPathBootstrap(options: { requireCodex: boolean }) {
  return [
    'codex_gateway_path_add() { if [ -d "$1" ]; then case ":$PATH:" in *":$1:"*) ;; *) PATH="$PATH:$1" ;; esac; fi; };',
    'for dir in "${CODEX_INSTALL_DIR:-$HOME/.local/bin}" "$HOME/.local/bin" "$HOME/.npm-global/bin" "$HOME/.bun/bin" "$HOME/.nvm/current/bin" "$HOME/.nvm/versions/node"/*/bin /opt/homebrew/bin /opt/node/bin /usr/local/bin /usr/bin; do codex_gateway_path_add "$dir"; done; export PATH;',
    'CODEX_BIN="$(command -v codex 2>/dev/null || true)";',
    'if [ -z "$CODEX_BIN" ] && [ -x "${CODEX_INSTALL_DIR:-$HOME/.local/bin}/codex" ]; then CODEX_BIN="${CODEX_INSTALL_DIR:-$HOME/.local/bin}/codex"; fi;',
    'if [ -z "$CODEX_BIN" ] && command -v npm >/dev/null 2>&1; then NPM_PREFIX="$(npm prefix -g 2>/dev/null || true)"; if [ -n "$NPM_PREFIX" ] && [ -x "$NPM_PREFIX/bin/codex" ]; then CODEX_BIN="$NPM_PREFIX/bin/codex"; fi; fi;',
    'if [ -z "$CODEX_BIN" ] && command -v npm >/dev/null 2>&1; then NPM_ROOT="$(npm root -g 2>/dev/null || true)"; if [ -n "$NPM_ROOT" ] && [ -x "$NPM_ROOT/.bin/codex" ]; then CODEX_BIN="$NPM_ROOT/.bin/codex"; fi; fi;',
    options.requireCodex
      ? 'if [ -z "$CODEX_BIN" ]; then echo "codex executable not found. Install @openai/codex or set CODEX_INSTALL_DIR to the directory containing codex." >&2; exit 127; fi;'
      : "",
    "export CODEX_BIN;",
  ].join(" ");
}

export function codexRemoteAppServerStartPayload() {
  return codexRemotePayload(`
set -eu
${ensureGatewayCodexConfigFeatureSnippet()}
"$CODEX_BIN" app-server --listen unix://
`);
}

export function codexRemoteAppServerProxyPayload() {
  return codexRemotePayload(`
set -eu
socket="\${CODEX_HOME:-$HOME/.codex}/app-server-control/app-server-control.sock"
${ensureGatewayCodexConfigFeatureSnippet()}
${appServerSocketHasListenerSnippet()}
if [ -S "$socket" ] && ! codex_gateway_socket_has_listener; then
  rm -f "$socket"
fi
if ! [ -S "$socket" ]; then
  mkdir -p "$(dirname "$socket")"
  nohup "$CODEX_BIN" app-server --listen unix:// >/tmp/codex-gateway-app-server.log 2>&1 </dev/null &
  for i in $(seq 1 100); do
    if [ -S "$socket" ] && codex_gateway_socket_has_listener; then
      break
    fi
    sleep 0.1
  done
fi
[ -S "$socket" ] && codex_gateway_socket_has_listener
exec "$CODEX_BIN" app-server proxy
`);
}

export function codexRemoteAppServerExistingProxyPayload() {
  return codexRemotePayload('"$CODEX_BIN" app-server proxy');
}

export function codexRemoteAppServerRuntimeStatePayload() {
  return codexRemotePayload(`
socket="\${CODEX_HOME:-$HOME/.codex}/app-server-control/app-server-control.sock"
${appServerSocketHasListenerSnippet()}
if [ -S "$socket" ] && codex_gateway_socket_has_listener; then
  echo '{"status":"running","backend":"socket"}'
else
  echo '{"status":"stopped"}'
fi
`);
}

export function codexRemoteVersionPayload() {
  return codexRemotePayload('"$CODEX_BIN" --version');
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
  if ! kill -0 "$pid" 2>/dev/null; then
    rm -f "$socket"
    exit 0
  fi
  sleep 0.1
done
echo "Unmanaged app-server did not stop after SIGTERM: $pid" >&2
exit 1
`);
}

export function codexRemoteAppServerVerifyPayload() {
  return codexRemotePayload(`
set -eu
${ensureGatewayCodexConfigFeatureSnippet()}
"$CODEX_BIN" --version
"$CODEX_BIN" app-server proxy --help >/dev/null
`);
}

export function remoteLoginShellCommand(payload: string) {
  const wrapper = [
    'if [ -z "$SHELL" ] || [ ! -x "$SHELL" ]; then',
    'echo "Codex remote SSH requires SHELL to point to an executable login shell" >&2; exit 127;',
    "fi;",
    'CODEX_REMOTE_PAYLOAD="$1"; export CODEX_REMOTE_PAYLOAD;',
    'case "${SHELL##*/}" in',
    // bash -l -c does not read ~/.bashrc, where nvm is commonly initialized.
    'bash|zsh) exec "$SHELL" -l -i -c \'exec 1>&4 2>&3; exec /bin/sh -c "$CODEX_REMOTE_PAYLOAD"\' 3>&2 4>&1 >/dev/null 2>/dev/null ;;',
    'csh|tcsh) exec "$SHELL" -i -c \'set loginsh=1; if ( -r /etc/csh.login ) source /etc/csh.login; if ( -r ~/.login ) source ~/.login; exec /bin/sh -c "$CODEX_REMOTE_PAYLOAD"\' ;;',
    "nu) exec \"$SHELL\" -l -i -c 'exec /bin/sh -c $env.CODEX_REMOTE_PAYLOAD' ;;",
    '*) exec "$SHELL" -l -c \'exec /bin/sh -c "$CODEX_REMOTE_PAYLOAD"\' ;;',
    "esac",
  ].join(" ");

  return `sh -c ${shellQuote(wrapper)} sh ${shellQuote(payload)}`;
}

function ensureGatewayCodexConfigFeatureSnippet() {
  return `
codex_home="\${CODEX_HOME:-$HOME/.codex}"
config_file="$codex_home/config.toml"
config_tmp="$config_file.$$.\${RANDOM:-0}.tmp"
mkdir -p "$codex_home"
touch "$config_file"
awk '
  BEGIN { in_features = 0; saw_features = 0; wrote_key = 0 }
  /^\\[features\\][[:space:]]*$/ {
    print
    in_features = 1
    saw_features = 1
    next
  }
  /^\\[/ {
    if (in_features && !wrote_key) {
      print "apply_patch_streaming_events = true"
      wrote_key = 1
    }
    in_features = 0
    print
    next
  }
  in_features && /^[[:space:]]*apply_patch_streaming_events[[:space:]]*=/ {
    if (!wrote_key) {
      print "apply_patch_streaming_events = true"
      wrote_key = 1
    }
    next
  }
  { print }
  END {
    if (in_features && !wrote_key) {
      print "apply_patch_streaming_events = true"
      wrote_key = 1
    }
    if (!saw_features) {
      print ""
      print "[features]"
      print "apply_patch_streaming_events = true"
    }
  }
' "$config_file" > "$config_tmp" && mv "$config_tmp" "$config_file"
true
`;
}

function appServerSocketHasListenerSnippet() {
  return `
codex_gateway_socket_has_listener() {
  if ! [ -S "$socket" ]; then
    return 1
  fi
  if [ -r /proc/net/unix ]; then
    awk -v socket="$socket" '$NF == socket && $4 == "00010000" { found = 1 } END { exit found ? 0 : 1 }' /proc/net/unix
    return $?
  fi
  return 0
}
`;
}
