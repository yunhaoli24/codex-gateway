import { z } from "zod";

/**
 * Provider is a session-level backend choice, not part of a model id. Keep the
 * registry in shared code so the browser picker and server trust boundary use
 * exactly the same identifiers.
 */
export const agentProviderIds = ["codex"] as const;
export type AgentProviderId = (typeof agentProviderIds)[number];

export const agentProviderIdSchema = z.enum(agentProviderIds);

export interface AgentProviderOption {
  id: AgentProviderId;
  labelKey: "app.agentProviderCodex";
}

export const agentProviderOptions: readonly AgentProviderOption[] = [
  { id: "codex", labelKey: "app.agentProviderCodex" },
];
