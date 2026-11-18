import type { GatewayThread } from "../../../shared/types";

export type GatewayThreadFixture = Pick<GatewayThread, "id"> & Partial<GatewayThread>;

export function gatewayThreadFixture(
  fixture: GatewayThreadFixture,
  scope: { hostId?: number; cwd?: string | null } = {},
): GatewayThread {
  const now = Math.floor(Date.now() / 1000);
  const name = fixture.name ?? null;
  return {
    environments: null,
    extra: null,
    sessionId: fixture.id,
    forkedFromId: null,
    attachedToThreadId: null,
    parentThreadId: null,
    preview: name ?? "",
    ephemeral: false,
    section: null,
    sectionEnteredAt: null,
    projectId: null,
    historyMode: "paginated",
    modelProvider: "e2e",
    model: "gpt-6-luna",
    reasoningEffort: "medium",
    createdAt: now,
    updatedAt: now,
    recencyAt: now,
    status: { type: "idle" },
    path: null,
    cwd: scope.cwd ?? "/tmp/e2e",
    cliVersion: "0.162.1",
    originator: "app-server",
    source: "appServer",
    canAcceptDirectInput: true,
    threadSource: null,
    agentNickname: null,
    agentRole: null,
    daybreakEnabled: null,
    gitInfo: null,
    name,
    turns: [],
    hostId: scope.hostId ?? 1,
    pinned: false,
    title: name,
    ...fixture,
  };
}
