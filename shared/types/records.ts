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

export interface RpcEnvelope {
  id?: number | string;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export interface GatewayEvent {
  id: number;
  hostId: number;
  threadId: string;
  method: string;
  payload: RpcEnvelope;
  createdAt: string;
}
