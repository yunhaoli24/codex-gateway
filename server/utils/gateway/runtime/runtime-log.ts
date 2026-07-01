export function runtimeLog(message: string, details: Record<string, unknown> = {}) {
  console.info(`[gateway-runtime] ${message}`, details);
}
