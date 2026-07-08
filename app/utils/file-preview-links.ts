export interface RemoteFileLinkTarget {
  path: string;
  line: number | null;
}

const likelyRemotePath = /^\/(?:data|home|mnt|opt|root|srv|tmp|var|workspace)\//;
const fileLikePath = /\.[A-Za-z0-9][A-Za-z0-9_-]{0,12}(?::\d+)?$/;

export function parseRemoteFileLink(href: string, baseHref: string): RemoteFileLinkTarget | null {
  let url: URL;
  try {
    url = new URL(href, baseHref);
  } catch {
    return null;
  }

  const base = new URL(baseHref);
  if (url.origin !== base.origin) {
    return null;
  }

  const decodedPath = decodeURIComponent(url.pathname);
  if (!likelyRemotePath.test(decodedPath) || !fileLikePath.test(decodedPath)) {
    return null;
  }

  const { path, line } = splitLineSuffix(decodedPath);
  return { path, line };
}

function splitLineSuffix(path: string) {
  const match = /^(.*):(\d+)$/.exec(path);
  if (!match?.[1] || !match[2]) {
    return { path, line: null };
  }
  return {
    path: match[1],
    line: Number(match[2]),
  };
}
