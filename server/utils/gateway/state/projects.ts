import type { ProjectCreateInput, ProjectRecord } from "~~/shared/types";
import { posix } from "node:path";
import { currentGatewayMemoryState, nowIso } from "./memory";
import { assertWorkspacePath, workspaceRootsForHost } from "./workspace-scope";

// Directory groups are navigation state, not a second persistent project catalog. Codex owns
// thread cwd; pins identify threads independently, so neither needs a Gateway-generated ID.
export const projectStore = {
  pruneToHosts(hostIds: Set<number>) {
    currentGatewayMemoryState().projects = this.list().filter((project) =>
      hostIds.has(project.hostId),
    );
  },

  deleteForHost(hostId: number) {
    currentGatewayMemoryState().projects = this.list().filter(
      (project) => project.hostId !== hostId,
    );
  },

  list(hostId?: number): ProjectRecord[] {
    return currentGatewayMemoryState()
      .projects.filter((project) => hostId === undefined || project.hostId === hostId)
      .sort((left, right) => left.name.localeCompare(right.name));
  },

  get(hostId: number, cwd: string): ProjectRecord | null {
    return this.list(hostId).find((project) => project.remotePath === cwd.trim()) ?? null;
  },

  create(input: ProjectCreateInput): ProjectRecord {
    assertWorkspacePath(input.hostId, input.remotePath);
    const roots = workspaceRootsForHost(input.hostId);
    if (roots !== undefined && !roots.some((root) => root.remotePath === input.remotePath.trim())) {
      throw new Error("Only configured workspace folders can be added");
    }
    const existing = this.get(input.hostId, input.remotePath);
    const timestamp = nowIso();
    const project = {
      hostId: input.hostId,
      name: input.name.trim(),
      remotePath: input.remotePath.trim(),
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
    };
    currentGatewayMemoryState().projects = [
      ...this.list().filter(
        (item) => item.hostId !== project.hostId || item.remotePath !== project.remotePath,
      ),
      project,
    ];
    return project;
  },

  ensureForPath(hostId: number, remotePath: string): ProjectRecord {
    assertWorkspacePath(hostId, remotePath);
    const cwd = posix.normalize(remotePath.trim());
    const roots = workspaceRootsForHost(hostId);
    if (roots !== undefined) {
      const root = roots.find(
        (root) =>
          cwd === root.remotePath || cwd.startsWith(`${root.remotePath.replace(/\/$/, "")}/`),
      );
      if (root !== undefined) return this.get(hostId, root.remotePath) ?? this.create(root);
    }
    return (
      this.get(hostId, cwd) ??
      this.create({
        hostId,
        remotePath: cwd,
        name:
          cwd
            .split("/")
            .filter((part) => part !== "")
            .at(-1) ?? "root",
      })
    );
  },

  count() {
    return currentGatewayMemoryState().projects.length;
  },
};
