import { posix } from "node:path";
import { createError } from "h3";
import { currentGatewayMemoryState } from "./memory";

export function workspaceRootsForHost(hostId: number) {
  return currentGatewayMemoryState().workspaceRoots?.filter((root) => root.hostId === hostId);
}

function contains(root: string, path: string) {
  const base = posix.normalize(root);
  const candidate = posix.normalize(path);
  return (
    candidate === base || candidate.startsWith(base === "/" ? "/" : `${base.replace(/\/$/, "")}/`)
  );
}

export function isWorkspacePath(hostId: number, path: string | null | undefined) {
  const roots = workspaceRootsForHost(hostId);
  if (roots === undefined) return true;
  return (
    typeof path === "string" &&
    path.startsWith("/") &&
    roots.some((root) => contains(root.remotePath, path))
  );
}

export function isWorkspaceDirectory(hostId: number, path: string) {
  return (
    isWorkspacePath(hostId, path) ||
    (workspaceRootsForHost(hostId)?.some((root) => contains(path, root.remotePath)) ?? false)
  );
}

export function assertWorkspacePath(hostId: number, path: string | null | undefined) {
  if (!isWorkspacePath(hostId, path)) {
    throw createError({ statusCode: 403, message: "Path is outside this account's workspace" });
  }
}
