export interface RemoteFileLinkTarget {
  path: string;
  line: number | null;
}

const browserOwnedPath = /^(?:\/$|\/(?:_nuxt|api|favicon\.ico|robots\.txt)(?:\/|$))/;

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
  const { path, line } = splitLineSuffix(decodedPath);
  if (browserOwnedPath.test(path)) {
    return null;
  }

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
