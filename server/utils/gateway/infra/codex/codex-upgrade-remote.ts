import type { CodexArtifactBundle } from "./codex-artifacts";
import { codexRemoteBootstrapPayload } from "../ssh/remote-command";
import { shellQuote } from "../ssh/shell";

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

export function codexRemoteCreateUpgradeStagePayload(sha256: string) {
  return codexRemoteBootstrapPayload(
    `
set -eu
stage_root="$HOME/.cache/codex-gateway/upgrades"
# Content-addressed staging survives a failed workflow and Gateway restarts. The existing
# physical-target lock serializes aliases; a new archive digest never reuses unrelated bytes.
stage="$stage_root/upgrade.${sha256}"
mkdir -p "$stage"
chmod 0700 "$stage_root" "$stage"
printf '%s\\n' "$stage"
`,
    { requireCodex: false },
  );
}

export function codexRemoteCleanupUpgradeStagePayload(stagePath: string) {
  return codexRemoteBootstrapPayload(`rm -rf -- ${shellQuote(stagePath)}`, {
    requireCodex: false,
  });
}

export function codexRemoteStandaloneInstallPayload(input: {
  version: string;
  releaseTarget: string;
  stagePath: string;
  artifacts: CodexArtifactBundle;
}) {
  const archive = input.artifacts.standaloneArchive;
  const archiveFile = `${input.stagePath}/${archive.fileName}`;
  return codexRemoteBootstrapPayload(
    `
set -eu
stage=${shellQuote(input.stagePath)}
archive_file=${shellQuote(archiveFile)}
expected_archive_sha=${shellQuote(archive.sha256)}
version=${shellQuote(input.version)}
release_target=${shellQuote(input.releaseTarget)}
codex_home="\${CODEX_HOME:-$HOME/.codex}"
install_root="$codex_home/packages/standalone"
releases_dir="$install_root/releases"
release_dir="$releases_dir/$version-$release_target"
current_link="$install_root/current"
bin_dir="\${CODEX_INSTALL_DIR:-$HOME/.local/bin}"
bin_path="$bin_dir/codex"
code_mode_host_bin_path="$bin_dir/codex-code-mode-host"
stage_release="$releases_dir/.staging.$version-$release_target.$$"

replace_path_with_symlink() {
  link_path="$1"
  link_target="$2"
  tmp_link="$3"
  rm -f "$tmp_link"
  ln -s "$link_target" "$tmp_link"
  if mv -Tf "$tmp_link" "$link_path" 2>/dev/null; then
    return
  fi
  if mv -hf "$tmp_link" "$link_path" 2>/dev/null; then
    return
  fi
  # Older standalone attempts could leave current as a real directory. rm -f cannot remove
  # that path, and replacing it in place would make every later upload fail after transfer. Move
  # the stale directory aside before installing the new symlink, then remove only that old tree.
  if [ -d "$link_path" ] && [ ! -L "$link_path" ]; then
    stale_path="$link_path.stale.$$"
    rm -rf "$stale_path"
    mv "$link_path" "$stale_path"
    if mv "$tmp_link" "$link_path"; then
      rm -rf "$stale_path"
      return
    fi
    mv "$stale_path" "$link_path"
    return 1
  fi
  rm -f "$link_path"
  mv -f "$tmp_link" "$link_path"
}

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
  echo "sha256sum or shasum is required to verify the official Codex archive" >&2
  return 1
}

if ! verify_sha256 "$archive_file" "$expected_archive_sha"; then
  # Interrupted SFTP writes can leave holes even when stat reports the full size. Discard a
  # corrupt archive so the next retry can repair it instead of repeatedly skipping the upload.
  rm -f "$archive_file"
  echo "Codex archive checksum verification failed; discarded for retry" >&2
  exit 1
fi
mkdir -p "$releases_dir" "$bin_dir"
rm -rf "$stage_release"
mkdir -p "$stage_release"
tar -xzf "$archive_file" -C "$stage_release"
test -f "$stage_release/codex-package.json" || { echo "Codex standalone archive is missing codex-package.json" >&2; exit 1; }
test -x "$stage_release/bin/codex" || { echo "Codex standalone archive is missing bin/codex" >&2; exit 1; }
test -x "$stage_release/bin/codex-code-mode-host" || { echo "Codex standalone archive is missing bin/codex-code-mode-host" >&2; exit 1; }
test -x "$stage_release/codex-path/rg" || { echo "Codex standalone archive is missing codex-path/rg" >&2; exit 1; }
chmod 0755 "$stage_release/bin/codex" "$stage_release/bin/codex-code-mode-host" "$stage_release/codex-path/rg"
if [ -f "$stage_release/codex-resources/bwrap" ]; then
  chmod 0755 "$stage_release/codex-resources/bwrap"
fi

# This mirrors the official standalone release layout. The visible entrypoint always points
# through current, so future releases can switch versions without touching shell profiles.
ln -sf bin/codex "$stage_release/codex"
rm -rf "$release_dir"
mv "$stage_release" "$release_dir"
tmp_current="$install_root/.current.$$"
replace_path_with_symlink "$current_link" "$release_dir" "$tmp_current"
tmp_bin="$bin_dir/.codex.$$"
replace_path_with_symlink "$bin_path" "$current_link/bin/codex" "$tmp_bin"
case "$release_target" in
  *-apple-darwin)
    tmp_code_mode_host="$bin_dir/.codex-code-mode-host.$$"
    replace_path_with_symlink \
      "$code_mode_host_bin_path" \
      "$current_link/bin/codex-code-mode-host" \
      "$tmp_code_mode_host"
    ;;
  *)
    rm -f "$code_mode_host_bin_path"
    ;;
esac

installed_version="$("$bin_path" --version)"
case "$installed_version" in
  *"$version"*) ;;
  *) echo "Standalone Codex installation produced unexpected version: $installed_version" >&2; exit 1 ;;
esac
printf '%s\\n' "$installed_version"
`,
    { requireCodex: false },
  );
}
