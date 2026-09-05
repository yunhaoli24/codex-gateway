import type { GatewayThread } from "../../../shared/types";

export type GatewayThreadFixture = Pick<GatewayThread, "id"> & Partial<GatewayThread>;

export function gatewayThreadFixture(
  fixture: GatewayThreadFixture,
  scope: { hostId?: number; projectId?: number | null } = {},
): GatewayThread {
  const now = Math.floor(Date.now() / 1000);
  const name = fixture.name ?? null;
  return {
    extra: null,
    sessionId: fixture.id,
    forkedFromId: null,
    parentThreadId: null,
    preview: name ?? "",
    ephemeral: false,
    section: null,
    sectionEnteredAt: null,
    appServerProjectId: null,
    historyMode: "legacy",
    modelProvider: "e2e",
    model: "gpt-5.6-luna",
    reasoningEffort: "medium",
    createdAt: now,
    updatedAt: now,
    recencyAt: now,
    status: { type: "idle" },
    path: null,
    cwd: "/tmp/e2e",
    cliVersion: "0.153.4",
    source: "appServer",
    canAcceptDirectInput: true,
    threadSource: null,
    agentNickname: null,
    agentRole: null,
    gitInfo: null,
    name,
    turns: [],
    hostId: scope.hostId ?? 1,
    projectId: scope.projectId ?? null,
    pinned: false,
    title: name,
    ...fixture,
  };
}
