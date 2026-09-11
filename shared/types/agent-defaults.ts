import type { AgentProviderId } from "../agent/providers";
import type { ReasoningEffort } from "./thread";

/** Effective new-thread defaults resolved by the agent provider for one project directory. */
export interface AgentProjectDefaults {
  provider: AgentProviderId;
  model: string | null;
  effort: ReasoningEffort | null;
}
