import type { HostRecord } from "~~/shared/types";
import type { Readable } from "node:stream";

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

export interface DirectTcpChannelOptions {
  host: string;
  port: number;
}

export interface RemoteFileResult {
  path: string;
  size: number;
  sample: Buffer;
  stream: Readable;
}

export interface RemoteFileMetadata {
  path: string;
  size: number;
  modifiedAt: number;
}

export interface RemoteCodexVersionState {
  version: string;
  appServerVersion: string | null;
  supportedVersion: string;
  beforeVersion: string;
  upgraded: boolean;
  deferredUpgrade?: boolean;
}
