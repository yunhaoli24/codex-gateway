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
    'for dir in "${CODEX_INSTALL_DIR:-$HOME/.local/bin}" "$HOME/.local/bin" "$HOME/.npm-global/bin" "$HOME/.bun/bin" "$HOME/.nvm/current/bin" "$HOME/.nvm/versions/node"/*/bin "$HOME/.local/share/fnm/node-versions"/*/installation/bin "$HOME/.volta/bin" /opt/homebrew/bin /opt/node/bin /usr/local/bin /usr/bin; do codex_gateway_path_add "$dir"; done; export PATH;',
    // A host can still have an npm-managed Codex from before the standalone migration. Prefer the
    // managed standalone entrypoint, but fall back to executable discovery so that migration does
    // not silently turn a working installation into "codex executable not found".
    'CODEX_BIN="$(command -v codex 2>/dev/null || true)";',
    'managed_codex="${CODEX_INSTALL_DIR:-$HOME/.local/bin}/codex";',
    'if [ -x "$managed_codex" ]; then CODEX_BIN="$managed_codex"; fi;',
    options.requireCodex
      ? 'if [ -z "$CODEX_BIN" ]; then echo "codex executable not found. Install the official Codex standalone package or set CODEX_INSTALL_DIR to the directory containing codex." >&2; exit 127; fi;'
      : "",
    "export CODEX_BIN;",
  ].join(" ");
}

export function codexRemoteAppServerProxyPayload() {
  // Version preparation already ensures the official daemon is ready. The transport must only
  // attach; starting or repairing here creates a second lifecycle competing with upgrades.
  return codexRemotePayload('exec "$CODEX_BIN" app-server proxy');
}

export function codexRemoteDaemonPayload(command: string) {
  return codexRemotePayload(`
set -eu
cd "$HOME"
${ensureGatewayCodexConfigFeatureSnippet()}
exec "$CODEX_BIN" app-server daemon ${command}
`);
}

export function codexRemoteVersionPayload() {
  return codexRemotePayload(`
set -eu
"$CODEX_BIN" --version
codex_home="\${CODEX_HOME:-$HOME/.codex}"
standalone_current="$codex_home/packages/standalone/current"
standalone_bin="$standalone_current/bin/codex"
# The visible command is normally a direct symlink to current/bin/codex. An older install can also
# end at the release directory itself, so accept both stable official layouts without using
# readlink -f (unavailable on macOS).
if [ "$CODEX_BIN" = "$standalone_bin" ] ||
  [ "$(readlink "$CODEX_BIN" 2>/dev/null || true)" = "$standalone_bin" ] ||
  [ "$(readlink "$CODEX_BIN" 2>/dev/null || true)" = "$standalone_current" ]; then
  printf '%s\\n' "installation-layout standalone"
else
  printf '%s\\n' "installation-layout npm-or-external"
fi
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
    // Restore the SSH streams after suppressing startup chatter, then close the saved copies.
    // zsh otherwise passes FD 3/4 to Codex and its detached daemon/updater children. Those copies
    // keep the SSH output channels open after the lifecycle CLI exits, causing a false timeout.
    // Fix inheritance here rather than treating a partial JSON response or CLI exit as success:
    // exec must still drain both streams and observe the channel's actual close/error normally.
    'bash|zsh) exec "$SHELL" -l -i -c \'exec 1>&4 2>&3 3>&- 4>&-; exec /bin/sh -c "$CODEX_REMOTE_PAYLOAD"\' 3>&2 4>&1 >/dev/null 2>/dev/null ;;',
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
