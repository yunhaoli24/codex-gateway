import type { ProviderAdapter } from "./provider-adapter";
import { codexProviderAdapter } from "./providers/codex/codex-provider";
import type { AgentProviderId } from "~~/shared/agent/providers";

/**
 * Provider adapter registry.
 *
 * Phase 1 ships exactly one adapter (codex). Adding a backend later means
 * implementing {@link ProviderAdapter} and adding a factory to this table; the
 * neutral runtime keeps resolving through here and never imports a provider
 * module directly.
 *
 * Keep adapter construction lazy. The Codex adapter imports the RPC/runtime
 * layer, and that layer can resolve a provider while its modules are being
 * evaluated. Dereferencing the adapter in a top-level Map therefore creates a
 * temporal-dead-zone failure during E2E startup. A factory preserves the
 * typed registry while making module evaluation order irrelevant.
 */
type ProviderAdapterFactory = () => ProviderAdapter;

const providerAdapterFactories: ReadonlyMap<AgentProviderId, ProviderAdapterFactory> = new Map([
  ["codex", () => codexProviderAdapter],
]);

export function providerAdapterFor(id: AgentProviderId): ProviderAdapter {
  const factory = providerAdapterFactories.get(id);
  if (factory === undefined) {
    throw new Error(`No provider adapter is registered for "${id}"`);
  }
  return factory();
}
