import type { ProjectCreateInput, ProjectRecord, ProjectUpdateInput } from "~~/shared/types";
import { gatewayMemoryState, nextId, nowIso } from "./memory";

function normalizeProject(input: ProjectCreateInput, id = nextId(gatewayMemoryState.projects)) {
  const timestamp = nowIso();
  const existing = gatewayMemoryState.projects.find((project) => project.id === id);
  return {
    id,
    hostId: input.hostId,
    name: input.name.trim(),
    remotePath: input.remotePath.trim(),
    createdAt: existing?.createdAt || timestamp,
    updatedAt: timestamp,
  };
}

export const projectStore = {
  replaceProjects(projects: ProjectRecord[]) {
    gatewayMemoryState.projects = projects.map((project) => ({
      ...project,
      name: project.name.trim(),
      remotePath: project.remotePath.trim(),
    }));
    gatewayMemoryState.configuredProjectIds = new Set(projects.map((project) => project.id));
  },

  pruneToHosts(hostIds: Set<number>) {
    gatewayMemoryState.projects = gatewayMemoryState.projects.filter((project) =>
      hostIds.has(project.hostId),
    );
    pruneConfiguredProjectIds();
  },

  deleteForHost(hostId: number) {
    gatewayMemoryState.projects = gatewayMemoryState.projects.filter(
      (project) => project.hostId !== hostId,
    );
    pruneConfiguredProjectIds();
  },

  delete(id: number) {
    const existing = this.get(id);
    if (!existing) {
      return null;
    }
    gatewayMemoryState.projects = gatewayMemoryState.projects.filter(
      (project) => project.id !== id,
    );
    gatewayMemoryState.configuredProjectIds.delete(id);
    return existing;
  },

  list(hostId?: number): ProjectRecord[] {
    return gatewayMemoryState.projects
      .filter((project) => !hostId || project.hostId === hostId)
      .sort((left, right) => left.name.localeCompare(right.name));
  },

  listConfigured(): ProjectRecord[] {
    return this.list().filter((project) => gatewayMemoryState.configuredProjectIds.has(project.id));
  },

  get(id: number): ProjectRecord | null {
    return gatewayMemoryState.projects.find((project) => project.id === id) ?? null;
  },

  create(input: ProjectCreateInput): ProjectRecord {
    const project = upsertProject(input);
    gatewayMemoryState.configuredProjectIds.add(project.id);
    return project;
  },

  update(id: number, input: ProjectUpdateInput): ProjectRecord | null {
    const existing = this.get(id);
    if (!existing) {
      return null;
    }
    const project = normalizeProject(input, id);
    gatewayMemoryState.projects = gatewayMemoryState.projects.map((item) =>
      item.id === id ? project : item,
    );
    gatewayMemoryState.configuredProjectIds.add(id);
    return project;
  },

  ensureForPath(hostId: number, remotePath: string): ProjectRecord {
    const normalizedPath = remotePath.trim();
    const existing = gatewayMemoryState.projects.find(
      (project) => project.hostId === hostId && project.remotePath === normalizedPath,
    );
    if (existing) {
      return existing;
    }
    const name = normalizedPath.split("/").filter(Boolean).at(-1) || normalizedPath || "root";
    // Thread discovery needs a runtime grouping record, not a persisted user project.
    return upsertProject({ hostId, name, remotePath: normalizedPath });
  },

  count() {
    return gatewayMemoryState.projects.length;
  },
};

function upsertProject(input: ProjectCreateInput): ProjectRecord {
  const remotePath = input.remotePath.trim();
  const existing = gatewayMemoryState.projects.find(
    (project) => project.hostId === input.hostId && project.remotePath === remotePath,
  );
  const project = normalizeProject(input, existing?.id);
  if (existing) {
    gatewayMemoryState.projects = gatewayMemoryState.projects.map((item) =>
      item.id === existing.id ? project : item,
    );
  } else {
    gatewayMemoryState.projects.push(project);
  }
  return project;
}

function pruneConfiguredProjectIds() {
  const retainedIds = new Set(gatewayMemoryState.projects.map((project) => project.id));
  gatewayMemoryState.configuredProjectIds = new Set(
    [...gatewayMemoryState.configuredProjectIds].filter((id) => retainedIds.has(id)),
  );
}
