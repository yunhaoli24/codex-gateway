export function createRetryTimer(attempt: number, run: () => void) {
  return window.setTimeout(run, delayForRetry(attempt));
}

export function delayForRetry(attempt: number) {
  return Math.min(15_000, 1_000 * 2 ** Math.max(0, attempt - 1));
}

export function waitForRetry(attempt: number) {
  return new Promise((resolve) => globalThis.setTimeout(resolve, delayForRetry(attempt)));
}
