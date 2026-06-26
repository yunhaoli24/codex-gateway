export function codexRemotePayload(command: string) {
  return [
    'printf \'%b\' \'\\254\\341\\117\\004\\120\\367\\316\\361\' >/dev/null;',
    'PATH="${CODEX_INSTALL_DIR:-$HOME/.local/bin}:$PATH"; export PATH;',
    command,
  ].join(' ')
}

export function codexRemoteAppServerStartPayload() {
  return codexRemotePayload([
    'codex app-server daemon start',
  ].join(' '))
}

export function codexRemoteAppServerProxyPayload() {
  return codexRemotePayload('codex app-server daemon start >/dev/null && codex app-server proxy')
}

export function codexRemoteAppServerVerifyPayload() {
  return codexRemotePayload([
    'codex --version',
    'codex app-server daemon start >/dev/null',
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
