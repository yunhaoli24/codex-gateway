import type { TmuxPaneOutput, TmuxPaneSnapshot, TmuxSessionSnapshot } from "~~/shared/types";
import { remoteLoginShellCommand } from "../infra/remote-command";
import { sshConnections } from "../infra/host-services";
import { shellQuote } from "../infra/shell";
import type { HostWithSecret } from "../infra/ssh-types";

const FIELD_SEPARATOR = "|";
const RECORD_KIND = "pane";

export class TmuxUnavailableError extends Error {
  constructor(message = "tmux is not installed on the remote host") {
    super(message);
    this.name = "TmuxUnavailableError";
  }
}

export class RemoteTmuxScanner {
  async scan(host: HostWithSecret): Promise<TmuxSessionSnapshot[]> {
    const result = await sshConnections.exec(host, remoteLoginShellCommand(scanPayload()));
    if (result.code === 127 && result.stderr.includes("codex_gateway_tmux_unavailable")) {
      throw new TmuxUnavailableError();
    }
    if (result.code !== 0) {
      throw new Error(result.stderr.trim() || result.stdout.trim() || "Failed to scan remote tmux");
    }
    return groupSessions(parsePanes(result.stdout));
  }

  async capturePane(
    host: HostWithSecret,
    target: { sessionId: string; paneId: string },
  ): Promise<TmuxPaneOutput> {
    const result = await sshConnections.exec(
      host,
      remoteLoginShellCommand(capturePanePayload(target)),
    );
    if (result.code !== 0) {
      throw new Error(
        result.stderr.trim() || result.stdout.trim() || "Failed to capture tmux pane",
      );
    }
    return {
      output: result.stdout,
      capturedAt: new Date().toISOString(),
    };
  }
}

function capturePanePayload(target: { sessionId: string; paneId: string }) {
  const sessionId = shellQuote(target.sessionId);
  const paneId = shellQuote(target.paneId);
  return `
set -eu
actual_session_id="$(tmux display-message -p -t ${paneId} -F '#{session_id}')"
actual_pane_id="$(tmux display-message -p -t ${paneId} -F '#{pane_id}')"
[ "$actual_session_id" = ${sessionId} ] && [ "$actual_pane_id" = ${paneId} ] || {
  echo "The selected tmux pane identity changed" >&2
  exit 1
}
# A training pane can retain an enormous history. Bound both lines and bytes before the
# gateway buffers this one-shot SSH exec result; this does not create another SSH client.
tmux capture-pane -p -S -500 -t ${paneId} | tail -c 262144
`;
}

function scanPayload() {
  return `
set -u
if ! command -v tmux >/dev/null 2>&1 || ! command -v ps >/dev/null 2>&1 || ! command -v base64 >/dev/null 2>&1; then
  echo codex_gateway_tmux_unavailable >&2
  exit 127
fi
status=0
pane_ids="$(tmux list-panes -a -F '#{pane_id}' 2>&1)" || status=$?
if [ "$status" -ne 0 ]; then
  case "$pane_ids" in
    *"no server running"*|*"failed to connect to server"*) exit 0 ;;
    *) printf '%s\n' "$pane_ids" >&2; exit "$status" ;;
  esac
fi
encode() { printf '%s' "$1" | base64 | tr -d '\n'; }
printf '%s\n' "$pane_ids" | while IFS= read -r pane_id; do
  [ -n "$pane_id" ] || continue
  session_name="$(tmux display-message -p -t "$pane_id" -F '#{session_name}')"
  session_id="$(tmux display-message -p -t "$pane_id" -F '#{session_id}')"
  session_created="$(tmux display-message -p -t "$pane_id" -F '#{session_created}')"
  window_index="$(tmux display-message -p -t "$pane_id" -F '#{window_index}')"
  window_name="$(tmux display-message -p -t "$pane_id" -F '#{window_name}')"
  pane_index="$(tmux display-message -p -t "$pane_id" -F '#{pane_index}')"
  pane_pid="$(tmux display-message -p -t "$pane_id" -F '#{pane_pid}')"
  pane_tty="$(tmux display-message -p -t "$pane_id" -F '#{pane_tty}')"
  pane_dead="$(tmux display-message -p -t "$pane_id" -F '#{pane_dead}')"
  pane_start_command="$(tmux display-message -p -t "$pane_id" -F '#{pane_start_command}')"
  current_command="$(tmux display-message -p -t "$pane_id" -F '#{pane_current_command}')"
  running=1
  [ "$pane_dead" = "1" ] && running=0
  if [ "$running" -eq 1 ] && [ -z "$pane_start_command" ]; then
    root_executable="$(readlink -f "/proc/$pane_pid/exe" 2>/dev/null || true)"
    root_is_login_shell=0
    if [ -n "$root_executable" ] && [ -r /etc/shells ]; then
      while IFS= read -r shell_path; do
        case "$shell_path" in ''|'#'*) continue ;; esac
        if [ "$root_executable" -ef "$shell_path" ] 2>/dev/null; then
          root_is_login_shell=1
          break
        fi
      done < /etc/shells
    fi
    if [ "$root_is_login_shell" -eq 1 ]; then
      # tcgetpgrp semantics are exposed by ps as tpgid. A default interactive shell is
      # idle only when it owns the foreground process group and no non-zombie process is
      # still attached to the pane TTY. Unknown process state stays running by design.
      process_state="$(ps -o pgid=,tpgid= -p "$pane_pid" 2>/dev/null || true)"
      set -- $process_state
      if [ "$#" -ge 2 ] && [ "$1" = "$2" ]; then
        running=0
        for process_pid in $(ps -t "$pane_tty" -o pid=,stat= 2>/dev/null | while read -r pid state; do
          case "$state" in Z*) ;; *) printf '%s\n' "$pid" ;; esac
        done); do
          if [ "$process_pid" != "$pane_pid" ]; then
            running=1
            break
          fi
        done
      fi
    fi
  fi
  printf '${RECORD_KIND}|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s\n' \
    "$(encode "$session_name")" "$(encode "$session_id")" "$session_created" "$window_index" \
    "$(encode "$window_name")" "$pane_index" "$(encode "$pane_id")" "$pane_pid" \
    "$(encode "$current_command")" "$running"
done
`;
}

function parsePanes(stdout: string): TmuxPaneSnapshot[] {
  return stdout
    .split("\n")
    .filter(Boolean)
    .map((line) => line.split(FIELD_SEPARATOR))
    .filter(([kind]) => kind === RECORD_KIND)
    .map((fields) => {
      if (fields.length !== 11) throw new Error("Invalid remote tmux scan response");
      return {
        sessionName: decodeField(fields[1]),
        sessionId: decodeField(fields[2]),
        sessionCreated: requiredInteger(fields[3], "session created"),
        windowIndex: requiredInteger(fields[4], "window index"),
        windowName: decodeField(fields[5]),
        paneIndex: requiredInteger(fields[6], "pane index"),
        paneId: decodeField(fields[7]),
        panePid: requiredInteger(fields[8], "pane pid"),
        currentCommand: decodeField(fields[9]),
        running: fields[10] === "1",
      };
    });
}

function decodeField(value: string | undefined) {
  if (value === undefined) throw new Error("Invalid remote tmux encoded field");
  return Buffer.from(value, "base64").toString("utf8");
}

function requiredInteger(value: string | undefined, field: string) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new Error(`Invalid remote tmux ${field}`);
  return parsed;
}

function groupSessions(panes: TmuxPaneSnapshot[]): TmuxSessionSnapshot[] {
  const sessions = new Map<string, TmuxSessionSnapshot>();
  for (const pane of panes) {
    const session = sessions.get(pane.sessionId) ?? {
      name: pane.sessionName,
      sessionId: pane.sessionId,
      sessionCreated: pane.sessionCreated,
      panes: [],
    };
    session.name = pane.sessionName;
    session.panes.push(pane);
    sessions.set(pane.sessionId, session);
  }
  return Array.from(sessions.values())
    .map((session) => ({
      ...session,
      panes: session.panes.sort(
        (left, right) => left.windowIndex - right.windowIndex || left.paneIndex - right.paneIndex,
      ),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}
