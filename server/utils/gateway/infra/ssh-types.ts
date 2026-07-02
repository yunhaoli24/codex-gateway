import type { HostRecord } from "~~/shared/types";

export type HostWithSecret = HostRecord;

export interface CommandResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

export interface ShellOptions {
  term: string;
  cols: number;
  rows: number;
}

export interface ReverseTcpForwardOptions {
  remoteHost: string;
  remotePort: number;
  targetHost: string;
  targetPort: number;
}

export interface RemoteFileResult {
  path: string;
  size: number;
  data: Buffer;
}

export interface RemoteCodexVersionState {
  version: string;
  appServerVersion: string | null;
  supportedVersion: string;
  beforeVersion: string;
  upgraded: boolean;
}
