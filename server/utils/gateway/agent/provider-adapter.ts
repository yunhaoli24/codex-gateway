import type { AgentEvent } from "~~/shared/agent/events";
import type { AgentProjectDefaults, HostRecord, RpcEnvelope } from "~~/shared/types";
import type { RpcTransportCloseDetail } from "../infra/rpc/rpc-errors";
import type { AgentProviderId } from "~~/shared/agent/providers";

/**
 * Neutral provider-adapter contract.
 *
 * A provider adapter is the single translation boundary between one agent
 * backend (Codex app-server today) and the Gateway's canonical event model.
 * Provider-specific history projection is completed before the event reaches
 * the neutral runtime. The runtime therefore never needs a raw method name.
 */

/** A provider notification before translation; opaque to the neutral runtime. */
export interface ProviderNotification {
  method: string;
  params: unknown;
  /** RPC request id (present for server→client requests). */
  id?: string | number;
  /** Provider identity is resolved by the owning host session, not inferred from the event. */
  emittedAtMs?: number;
}

/**
 * The smallest RPC port the neutral runtime needs from an agent provider.
 *
 * This is deliberately not `CodexRpcClient`: a provider owns transport
 * construction and may use a different RPC implementation later. Keeping the
 * port here prevents HostRpcSession and ThreadController from becoming Codex
 * clients with a provider switch bolted on afterwards.
 */
export interface AgentRpcClient {
  on(event: "notification", handler: (message: RpcEnvelope) => void): () => void;
  on(event: "request", handler: (message: RpcEnvelope) => void): () => void;
  on(event: "stderr", handler: (text: string) => void): () => void;
  on(event: "close", handler: (detail: RpcTransportCloseDetail) => void): () => void;
  connect(): Promise<void>;
  request(method: string, params?: unknown, timeoutMs?: number): Promise<unknown>;
  request<T>(
    method: string,
    params: unknown,
    timeoutMs: number,
    parse: (value: unknown) => T,
  ): Promise<T>;
  notify(method: string, params: unknown): void;
  respond(id: string | number, result: unknown): void;
  respondError(id: string | number, code: number, message: string, data?: unknown): void;
  close(): void;
  hasDeferredUpgrade?(): boolean;
  resolveDeferredUpgrade?(): void;
}

export type ProviderMappingResult =
  | ProviderMappedNotification
  | { kind: "ignored"; method: string; reason: "ambient" | "handled" }
  | {
      kind: "rejected";
      method: string;
      code: "invalid-payload" | "unsupported-method";
      message: string;
    };

/**
 * The provider boundary returns only the neutral event plus the upstream
 * timestamp. Provider-specific method names and payloads do not cross into
 * the runtime snapshot or browser event stream.
 */
export interface ProviderMappedNotification {
  kind: "event";
  event: AgentEvent;
  /** App-server emission time, when the provider supplies one. */
  emittedAtMs?: number;
}

export interface ProviderAdapter {
  readonly id: AgentProviderId;
  createClient(host: HostRecord): AgentRpcClient;
  /** Resolve the provider's effective new-thread settings for a project configuration scope. */
  readProjectDefaults(client: AgentRpcClient, cwd: string): Promise<AgentProjectDefaults>;
  /** Handle provider-specific server requests before neutral thread routing. */
  handleServerRequest(client: AgentRpcClient, message: RpcEnvelope): boolean;
  /** Run provider-specific connection lifecycle hooks without exposing them to runtime code. */
  handleNotification(client: AgentRpcClient, host: HostRecord, message: RpcEnvelope): void;
  /**
   * Translate a provider notification into a canonical AgentEvent.
   * Invalid and unsupported notifications return a diagnostic result instead
   * of silently disappearing; explicit ambient notifications may be ignored.
   */
  mapNotification(notification: ProviderNotification): ProviderMappingResult;
}
