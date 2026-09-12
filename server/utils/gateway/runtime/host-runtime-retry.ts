const INITIAL_RETRY_DELAY_MS = 1_000;
// A dead or unreachable host must not be dialed every minute forever. The slot remains
// single-flight, while this longer ceiling leaves recovery available without hammering SSH or
// the proxy path.
const MAX_RETRY_DELAY_MS = 300_000;

export function retryDelay(retryCount: number) {
  return Math.min(MAX_RETRY_DELAY_MS, INITIAL_RETRY_DELAY_MS * 2 ** Math.max(0, retryCount - 1));
}
