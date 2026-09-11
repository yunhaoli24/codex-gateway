import { HostMfaEventBus } from "./host-mfa-events";

interface MfaPendingRequest {
  userId: number;
  hostId: number;
  name: string;
  instructions: string;
  prompts: Array<{ prompt: string; echo?: boolean }>;
  resolve: (answers: string[]) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const MFA_TIMEOUT_MS = 120_000;

export class HostMfaManager {
  readonly events = new HostMfaEventBus();
  private pending = new Map<string, MfaPendingRequest>();
  /** Tracks which hosts are currently awaiting MFA so the SSH connection can signal "mfaRequired" */
  private awaitedHosts = new Set<string>();
  private detectedHosts = new Set<string>();

  isMfaHost(userId: number, hostId: number): boolean {
    return this.detectedHosts.has(`${userId}:${hostId}`);
  }

  isWaitingMfa(userId: number, hostId: number): boolean {
    return this.awaitedHosts.has(`${userId}:${hostId}`);
  }

  pendingRequestsForUser(userId: number): HostMfaEvent[] {
    return Array.from(this.pending.values()).flatMap((request) =>
      request.userId === userId
        ? [
            {
              type: "request" as const,
              hostId: request.hostId,
              name: request.name,
              instructions: request.instructions,
              prompts: request.prompts,
            },
          ]
        : [],
    );
  }

  /**
   * Called when an SSH connection receives a keyboard-interactive prompt.
   * Stores the pending request and emits a realtime event to the frontend.
   * Returns a promise that resolves with the user's answers (MFA codes).
   */
  requestMfa(
    userId: number,
    hostId: number,
    name: string,
    instructions: string,
    prompts: Array<{ prompt: string; echo?: boolean }>,
  ): Promise<string[]> {
    return new Promise((resolve, reject) => {
      const key = `${userId}:${hostId}`;
      this.detectedHosts.add(key);
      // Cancel any previous pending MFA for this host
      const existing = this.pending.get(key);
      if (existing !== undefined) {
        clearTimeout(existing.timer);
        existing.reject(new Error("MFA request superseded by a new authentication prompt"));
      }

      this.awaitedHosts.add(key);

      const timer = setTimeout(() => {
        this.pending.delete(key);
        this.awaitedHosts.delete(key);
        reject(new Error("MFA request timed out"));
      }, MFA_TIMEOUT_MS);

      this.pending.set(key, {
        userId,
        hostId,
        name,
        instructions,
        prompts,
        resolve,
        reject,
        timer,
      });
      this.events.publish(userId, {
        type: "request",
        hostId,
        name,
        instructions,
        prompts,
      });
    });
  }

  /**
   * Called by the realtime handler when the user submits their MFA code.
   */
  submitMfa(userId: number, hostId: number, code: string) {
    const key = `${userId}:${hostId}`;
    const pending = this.pending.get(key);
    if (pending === undefined) {
      throw new Error(`No pending MFA request for host ${hostId}`);
    }
    clearTimeout(pending.timer);
    this.pending.delete(key);
    this.awaitedHosts.delete(key);
    // Provide the code as the answer to the first (and typically only) prompt
    pending.resolve([code]);
  }

  cancelMfa(userId: number, hostId: number) {
    const key = `${userId}:${hostId}`;
    const pending = this.pending.get(key);
    if (pending === undefined) return;
    clearTimeout(pending.timer);
    this.pending.delete(key);
    this.awaitedHosts.delete(key);
    pending.reject(new Error("MFA request canceled"));
  }

  removeHost(userId: number, hostId: number) {
    const key = `${userId}:${hostId}`;
    const pending = this.pending.get(key);
    if (pending !== undefined) {
      clearTimeout(pending.timer);
      pending.reject(new Error("Host connection closed before MFA completed"));
      this.pending.delete(key);
    }
    this.awaitedHosts.delete(key);
    this.detectedHosts.delete(key);
  }
}
