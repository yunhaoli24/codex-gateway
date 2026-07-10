export function isConnectionLevelSshError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /No response from server|Not connected|Connection lost|Channel open failure|ECONNRESET|EPIPE/i.test(
    message,
  );
}
