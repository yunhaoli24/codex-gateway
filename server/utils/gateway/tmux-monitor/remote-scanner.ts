import type { TmuxPaneOutput, TmuxPaneSnapshot, TmuxSessionSnapshot } from "~~/shared/types";
import pLimit from "p-limit";
import { remoteLoginShellCommand } from "../infra/remote-command";
import { sshConnections } from "../infra/host-services";
import { shellQuote } from "../infra/shell";
import type { HostWithSecret } from "../infra/ssh-types";
import { currentGatewayUserId } from "../state/memory";

const FIELD_SEPARATOR = "|";
const RECORD_KIND = "pane";
const TMUX_SCAN_CONCURRENCY = 3;

export class TmuxUnavailableError extends Error {
  constructor(message = "tmux is not installed on the remote host") {
    super(message);
    this.name = "TmuxUnavailableError";
  }
}

export class RemoteTmuxScanner {
  private readonly scanLimit = pLimit(TMUX_SCAN_CONCURRENCY);
  private readonly pendingScans = new Map<string, Promise<TmuxSessionSnapshot[]>>();

  async scan(host: HostWithSecret): Promise<TmuxSessionSnapshot[]> {
    const key = `${currentGatewayUserId() ?? "anonymous"}:${host.id}`;
    const pending = this.pendingScans.get(key);
    if (pending) return await pending;

    // Interactive dashboard scans and the monitor poller share this queue and promise. They keep
    // the existing single SSH Client, but cannot open an unbounded number of exec channels.
    const request = this.scanLimit(() => this.scanNow(host));
    const tracked = request.finally(() => {
      if (this.pendingScans.get(key) === tracked) this.pendingScans.delete(key);
    });
    this.pendingScans.set(key, tracked);
    return await tracked;
  }

  private async scanNow(host: HostWithSecret): Promise<TmuxSessionSnapshot[]> {
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
if ! command -v tmux >/dev/null 2>&1 || ! command -v ps >/dev/null 2>&1 || ! command -v awk >/dev/null 2>&1 || ! command -v base64 >/dev/null 2>&1; then
  echo codex_gateway_tmux_unavailable >&2
  exit 127
fi
status=0
# tmux replaces literal control-character separators (including tabs) in format
# output. Its q: modifier is the supported transport for arbitrary field text:
# each string becomes one shell-escaped word, so one list-panes call remains
# parseable even when a session or window name contains spaces or delimiters.
format="#{q:session_name} #{q:session_id} #{session_created} #{window_index} #{q:window_name} #{pane_index} #{q:pane_id} #{pane_pid} #{q:pane_tty} #{pane_dead} #{q:pane_current_command}"
pane_rows="$(tmux list-panes -a -F "$format" 2>&1)" || status=$?
if [ "$status" -ne 0 ]; then
  case "$pane_rows" in
    *"no server running"*|*"failed to connect to server"*) exit 0 ;;
    *) printf '%s\n' "$pane_rows" >&2; exit "$status" ;;
  esac
fi
encode() { printf '%s' "$1" | base64 | tr -d '\n'; }
# Query the process table once per scan. A host with many panes previously executed two ps
# commands for every shell pane, which made the 15-second monitor poll itself expensive.
# The fields below are enough to retain the foreground-PGID and TTY ownership rule.
process_rows="$(ps -e -o pid=,pgid=,tpgid=,stat=,tty=,comm= 2>/dev/null || true)"
shell_commands=""
if [ -r /etc/shells ]; then
  shell_commands="$(awk '
    /^[[:space:]]*($|#)/ { next }
    { name = $0; sub(".*/", "", name); printf "%s ", name }
  ' /etc/shells)"
fi
printf '%s\n' "$pane_rows" | while IFS= read -r pane_row; do
  # Values originate from tmux's q: formatter above, which escapes shell
  # metacharacters into individual words. The set builtin restores the original
  # fields without invoking a second tmux command per pane.
  eval "set -- $pane_row"
  [ "$#" -eq 11 ] || continue
  session_name="$1"
  session_id="$2"
  session_created="$3"
  window_index="$4"
  window_name="$5"
  pane_index="$6"
  pane_id="$7"
  pane_pid="$8"
  pane_tty="$9"
  pane_dead="\${10}"
  current_command="\${11}"
  [ -n "$pane_id" ] || continue
  running=1
  [ "$pane_dead" = "1" ] && running=0
  if [ "$running" -eq 1 ]; then
    root_state="$(printf '%s\n' "$process_rows" | awk -v pid="$pane_pid" '
      $1 == pid { print $2, $3, $5, $6; exit }
    ')"
    set -- $root_state
    root_pgid="\${1:-}"
    root_tpgid="\${2:-}"
    root_tty="\${3:-}"
    root_command="\${4:-}"
    case " $shell_commands " in
      *" $root_command "*)
        # tcgetpgrp semantics are exposed by ps as tpgid. An interactive shell is
        # idle only when it owns the foreground process group and no non-zombie process is
        # still attached to the pane TTY. Unknown process state stays running by design.
        if [ -n "$root_pgid" ] && [ "$root_pgid" = "$root_tpgid" ]; then
          running=0
          if printf '%s\n' "$process_rows" | awk -v tty="$root_tty" -v root="$pane_pid" '
            $5 == tty && $1 != root && $4 !~ /^Z/ { found = 1; exit }
            END { exit !found }
          '; then
            running=1
          fi
        fi
        ;;
    esac
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
