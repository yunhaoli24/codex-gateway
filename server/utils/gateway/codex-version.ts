const NPM_LATEST_CODEX_URL = 'https://registry.npmjs.org/@openai%2Fcodex/latest'
const LATEST_VERSION_CACHE_MS = 60_000

let cachedLatestVersion: { version: string, expiresAt: number } | null = null

export interface ParsedCodexVersion {
  raw: string
  version: string
}

export function parseCodexVersion(output: string): ParsedCodexVersion | null {
  const raw = output.trim()
  const match = raw.match(/\b(\d+)\.(\d+)\.(\d+)(?:[-+][0-9A-Za-z.-]+)?\b/)
  if (!match) {
    return null
  }
  return {
    raw,
    version: match[0],
  }
}

export function compareSemver(left: string, right: string) {
  const leftParts = semverParts(left)
  const rightParts = semverParts(right)
  for (let index = 0; index < 3; index += 1) {
    const difference = leftParts[index] - rightParts[index]
    if (difference !== 0) {
      return difference
    }
  }
  return 0
}

export async function latestCodexCliVersion() {
  const now = Date.now()
  if (cachedLatestVersion && cachedLatestVersion.expiresAt > now) {
    return cachedLatestVersion.version
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15_000)
  try {
    const response = await fetch(NPM_LATEST_CODEX_URL, { signal: controller.signal })
    if (!response.ok) {
      throw new Error(`npm registry returned ${response.status}`)
    }
    const metadata = await response.json() as { version?: unknown }
    if (typeof metadata.version !== 'string') {
      throw new Error('npm registry response did not include a version')
    }
    semverParts(metadata.version)
    cachedLatestVersion = {
      version: metadata.version,
      expiresAt: now + LATEST_VERSION_CACHE_MS,
    }
    return metadata.version
  } finally {
    clearTimeout(timeout)
  }
}

export function isCodexVersionAtLeast(version: string, minimum: string) {
  return compareSemver(version, minimum) >= 0
}

function semverParts(version: string) {
  const parsed = version.match(/^(\d+)\.(\d+)\.(\d+)/)
  if (!parsed) {
    throw new Error(`Invalid semantic version: ${version}`)
  }
  return [Number(parsed[1]), Number(parsed[2]), Number(parsed[3])]
}
