export type HostAuthMode = "agent" | "privateKey" | "password";

export interface HostRecord {
  id: number;
  name: string;
  sshHost: string;
  username: string | null;
  port: number | null;
  authMode: HostAuthMode;
  privateKeyPath: string | null;
  privateKey?: string | null;
  password?: string | null;
  proxyUrl: string | null;
  hasPassword: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectRecord {
  id: number;
  hostId: number;
  name: string;
  remotePath: string;
  createdAt: string;
  updatedAt: string;
}

export type ProjectDirectoryAvailability = "available" | "missing";

export interface HostCreateInput {
  name: string;
  sshHost: string;
  username?: string | null;
  port?: number | null;
  authMode: HostAuthMode;
  privateKeyPath?: string | null;
  privateKey?: string | null;
  password?: string | null;
  proxyUrl?: string | null;
}

export type HostUpdateInput = HostCreateInput;

export interface ProjectCreateInput {
  hostId: number;
  name: string;
  remotePath: string;
}

export type ProjectUpdateInput = ProjectCreateInput;

interface RpcTrace {
  traceparent?: string | null;
  tracestate?: string | null;
}

interface RpcError {
  code: number;
  message: string;
  data?: unknown;
}

export type RpcEnvelope =
  | {
      id: number | string;
      method: string;
      params?: unknown;
      trace?: RpcTrace | null;
      result?: never;
      error?: never;
      emittedAtMs?: never;
    }
  | {
      method: string;
      params?: unknown;
      /** Unix time recorded by app-server when a notification was emitted. */
      emittedAtMs?: number;
      id?: never;
      result?: never;
      error?: never;
      trace?: never;
    }
  | {
      id: number | string;
      result: unknown;
      method?: never;
      params?: never;
      error?: never;
      trace?: never;
      emittedAtMs?: never;
    }
  | {
      id: number | string;
      error: RpcError;
      method?: never;
      params?: never;
      result?: never;
      trace?: never;
      emittedAtMs?: never;
    };

export function rpcEnvelopeCreatedAt(payload: unknown, fallback = new Date()): string {
  const emittedAtMs = recordFromUnknown(payload)?.emittedAtMs;
  if (typeof emittedAtMs !== "number" || !Number.isFinite(emittedAtMs)) {
    return fallback.toISOString();
  }
  const emittedAt = new Date(emittedAtMs);
  return Number.isFinite(emittedAt.getTime()) ? emittedAt.toISOString() : fallback.toISOString();
}

import type { AgentEvent } from "../agent/events";

export interface GatewayEvent {
  id: number;
  hostId: number;
  threadId: string;
  event: AgentEvent;
  createdAt: string;
}
import { recordFromUnknown } from "../utils/records";
