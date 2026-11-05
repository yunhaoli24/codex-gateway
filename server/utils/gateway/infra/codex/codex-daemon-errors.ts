// Ownership conflicts need operator action, unlike a transient SSH/startup failure. Keep the
// classification at the lifecycle boundary so neither retries nor callers parse display text.
export class CodexDaemonOwnershipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CodexDaemonOwnershipError";
  }
}
