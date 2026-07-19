import type { RpcEnvelope } from "~~/shared/types";
import { CodexRpcError } from "../http/errors";

interface PendingRequest {
  method: string;
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
  timer: NodeJS.Timeout;
}

export class RpcRequestBroker {
  private nextId = 1;
  private pending = new Map<number, PendingRequest>();

  request<T>(
    method: string,
    params: unknown,
    timeoutMs: number,
    send: (message: RpcEnvelope) => void,
  ): Promise<T> {
    const id = this.nextId++;
    const message = { id, method, params };
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Codex RPC request timed out: ${method}`));
      }, timeoutMs);
      this.pending.set(id, { method, resolve: (value) => resolve(value as T), reject, timer });
      try {
        send(message);
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error);
      }
    });
  }

  handleResponse(message: RpcEnvelope) {
    if (message.id === undefined) return false;
    const pending = this.pending.get(Number(message.id));
    if (!pending) return false;
    clearTimeout(pending.timer);
    this.pending.delete(Number(message.id));
    if (message.error) {
      pending.reject(
        new CodexRpcError(
          pending.method,
          message.error.code,
          message.error.message,
          message.error.data,
        ),
      );
    } else {
      pending.resolve(message.result);
    }
    return true;
  }

  rejectAll(error: Error) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }
}
