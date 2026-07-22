export function fileWorkspaceScopeKey(hostId: number, threadId: string) {
  return `${hostId}:${threadId}`;
}

export function fileDocumentKey(hostId: number, threadId: string, path: string) {
  return `${fileWorkspaceScopeKey(hostId, threadId)}:${path}`;
}

export function directoryStateKey(hostId: number, threadId: string, path: string) {
  return `${fileWorkspaceScopeKey(hostId, threadId)}:${path}`;
}

export function fileName(path: string) {
  return path.split("/").filter(Boolean).pop() || path;
}

export function parentPath(path: string) {
  const normalized = path.replace(/\/+$/, "");
  return normalized.slice(0, normalized.lastIndexOf("/")) || "/";
}

export function parentPaths(path: string) {
  const result: string[] = [];
  let current = parentPath(path);
  while (current && current !== "/") {
    result.push(current);
    current = parentPath(current);
  }
  result.push("/");
  return result;
}

export function isPathWithinRoot(rootPath: string, path: string) {
  const root = normalizeRemotePath(rootPath);
  const candidate = normalizeRemotePath(path);
  return root === "/" ? candidate.startsWith("/") : candidate.startsWith(`${root}/`);
}

export function directoryPathsToFile(rootPath: string, filePath: string) {
  if (!isPathWithinRoot(rootPath, filePath)) {
    return [];
  }
  return parentPaths(filePath)
    .reverse()
    .filter((path) => path === normalizeRemotePath(rootPath) || isPathWithinRoot(rootPath, path));
}

export function absolutePath(rootPath: string, path: string) {
  return path.startsWith("/") ? path : `${rootPath.replace(/\/$/, "")}/${path}`;
}

export function withoutPathAndDescendants(paths: string[], removedPath: string) {
  return paths.filter(
    (path) => path !== removedPath && !path.startsWith(`${removedPath.replace(/\/$/, "")}/`),
  );
}

function normalizeRemotePath(path: string) {
  return path.replace(/\/+$/, "") || "/";
}
