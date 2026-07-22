import type { CodexArtifactBundle } from "./codex-artifacts";
import { codexRemoteBootstrapPayload } from "./remote-command";
import { shellQuote } from "./shell";

export function codexRemotePlatformProbePayload() {
  return codexRemoteBootstrapPayload(
    `
set -eu
case "$(uname -s)" in Linux) platform=linux ;; Darwin) platform=darwin ;; *) echo "Unsupported remote OS: $(uname -s)" >&2; exit 1 ;; esac
case "$(uname -m)" in x86_64|amd64) arch=x64 ;; arm64|aarch64) arch=arm64 ;; *) echo "Unsupported remote architecture: $(uname -m)" >&2; exit 1 ;; esac
printf '%s %s\n' "$platform" "$arch"
`,
    { requireCodex: false },
  );
}

export function codexRemoteNodeRuntimeProbePayload() {
  return codexRemoteBootstrapPayload(
    `
set -eu
node_major="$(node -p 'Number(process.versions.node.split(".")[0])' 2>/dev/null || true)"
case "$node_major" in ""|*[!0-9]*) exit 1 ;; esac
[ "$node_major" -ge 16 ]
command -v npm >/dev/null 2>&1
printf '%s %s\n' "$(node --version)" "$(command -v node)"
`,
    { requireCodex: false },
  );
}

export function codexRemoteCreateUpgradeStagePayload() {
  return codexRemoteBootstrapPayload(
    `
set -eu
stage_root="$HOME/.cache/codex-gateway/upgrades"
mkdir -p "$stage_root"
find "$stage_root" -mindepth 1 -maxdepth 1 -type d -mmin +60 -name 'upgrade.*' -exec rm -rf {} + 2>/dev/null || true
mktemp -d "$stage_root/upgrade.XXXXXX"
`,
    { requireCodex: false },
  );
}

export function codexRemoteCleanupUpgradeStagePayload(stagePath: string) {
  return codexRemoteBootstrapPayload(`rm -rf -- ${shellQuote(stagePath)}`, {
    requireCodex: false,
  });
}

export function codexRemoteOfflineInstallPayload(input: {
  version: string;
  stagePath: string;
  artifacts: CodexArtifactBundle;
}) {
  const archiveFile = `${input.stagePath}/${input.artifacts.cacheArchive.fileName}`;
  const nodeArchive = input.artifacts.nodeArchive;
  return codexRemoteBootstrapPayload(
    `
set -eu
stage=${shellQuote(input.stagePath)}
verify_prefix="$stage/verify-prefix"
cleanup() {
  rm -rf -- "$stage"
}
trap cleanup EXIT HUP INT TERM

archive_file=${shellQuote(archiveFile)}
expected_archive_sha=${shellQuote(input.artifacts.cacheArchive.sha512)}
npm_cache="$stage/npm-cache"

verify_sha256() {
  if command -v sha256sum >/dev/null 2>&1; then
    printf '%s  %s\n' "$2" "$1" | sha256sum -c - >/dev/null
    return
  fi
  if command -v shasum >/dev/null 2>&1; then
    actual="$(shasum -a 256 "$1" | awk '{print $1}')"
    [ "$actual" = "$2" ]
    return
  fi
  echo "sha256sum or shasum is required to verify the official Node.js archive" >&2
  return 1
}

${
  nodeArchive
    ? `
node_archive=${shellQuote(`${input.stagePath}/${nodeArchive.fileName}`)}
verify_sha256 "$node_archive" ${shellQuote(nodeArchive.sha256)}
managed_node_dir="$HOME/.nvm/versions/node/v${nodeArchive.version}"
managed_node_tmp="$managed_node_dir.codex-gateway.$$"
rm -rf "$managed_node_tmp"
mkdir -p "$(dirname "$managed_node_dir")" "$stage/node-extract"
tar -xzf "$node_archive" -C "$stage/node-extract"
mv "$stage/node-extract/${nodeArchive.directoryName}" "$managed_node_tmp"
rm -rf "$managed_node_dir"
mv "$managed_node_tmp" "$managed_node_dir"
PATH="$managed_node_dir/bin:$PATH"
export PATH
hash -r
`
    : ""
}

node_major="$(node -p 'Number(process.versions.node.split(".")[0])' 2>/dev/null || true)"
case "$node_major" in ""|*[!0-9]*|0|1|2|3|4|5|6|7|8|9|10|11|12|13|14|15)
  echo "Node.js >=16 with npm is required after bootstrap; selected $(node --version 2>/dev/null || echo missing)" >&2
  exit 127
  ;;
esac
command -v npm >/dev/null 2>&1 || { echo "npm is required after Node.js bootstrap" >&2; exit 127; }

verify_sha512() {
  node -e '
    const { createReadStream } = require("node:fs");
    const { createHash } = require("node:crypto");
    const [path, expected] = process.argv.slice(1);
    const hash = createHash("sha512");
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", (error) => { console.error(error.message); process.exit(1); });
    stream.on("end", () => process.exit(hash.digest("hex") === expected ? 0 : 1));
  ' "$1" "$2"
}

verify_sha512 "$archive_file" "$expected_archive_sha"
mkdir -p "$npm_cache"
tar -xzf "$archive_file" -C "$npm_cache"

run_npm_install() {
  label="$1"
  shift
  echo "codex_gateway_upgrade_progress $label started $(date -u +%FT%TZ 2>/dev/null || true)" >&2
  "$@" &
  npm_pid="$!"
  while kill -0 "$npm_pid" 2>/dev/null; do
    sleep 10
    if kill -0 "$npm_pid" 2>/dev/null; then
      echo "codex_gateway_upgrade_progress $label still_running $(date -u +%FT%TZ 2>/dev/null || true)" >&2
    fi
  done
  set +e
  wait "$npm_pid"
  npm_status="$?"
  set -e
  echo "codex_gateway_upgrade_progress $label exited status=$npm_status $(date -u +%FT%TZ 2>/dev/null || true)" >&2
  return "$npm_status"
}

rm -rf "$verify_prefix"
# npm performs both installs from its official cache so package aliases, links, and global
# node_modules placement match a normal online npm install.
run_npm_install verify_install npm install -g --offline --force --ignore-scripts \
  --cache "$npm_cache" --prefix "$verify_prefix" @openai/codex@${input.version}
verify_version="$("$verify_prefix/bin/codex" --version)"
case "$verify_version" in
  *${input.version}*) ;;
  *) echo "Offline Codex verification installed unexpected version: $verify_version" >&2; exit 1 ;;
esac

codex_gateway_npm_prefix_writable() {
  prefix="$1"
  root="$2"
  [ -n "$prefix" ] && [ -n "$root" ] || return 1
  mkdir -p "$prefix/bin" "$root" 2>/dev/null || return 1
  [ -w "$prefix/bin" ] && [ -w "$root" ]
}

npm_global_prefix="$(npm prefix -g 2>/dev/null || true)"
npm_global_root="$(npm root -g 2>/dev/null || true)"
if ! codex_gateway_npm_prefix_writable "$npm_global_prefix" "$npm_global_root"; then
  npm_global_prefix="$HOME/.npm-global"
  mkdir -p "$npm_global_prefix"
fi

run_npm_install final_install npm install -g --offline --force --ignore-scripts \
  --cache "$npm_cache" --prefix "$npm_global_prefix" @openai/codex@${input.version}
final_version="$("$npm_global_prefix/bin/codex" --version)"
case "$final_version" in
  *${input.version}*) ;;
  *) echo "Offline Codex installation produced unexpected version: $final_version" >&2; exit 1 ;;
esac
printf '%s\\n' "$final_version"
`,
    { requireCodex: false },
  );
}
