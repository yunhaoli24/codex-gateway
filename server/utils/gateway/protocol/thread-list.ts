export const ALL_THREAD_SOURCE_KINDS = [
  "cli",
  "vscode",
  "exec",
  "appServer",
  "subAgent",
  "subAgentReview",
  "subAgentCompact",
  "subAgentThreadSpawn",
  "subAgentOther",
  "unknown",
] as const;

export function withAllThreadSources<T extends Record<string, unknown>>(params: T) {
  return {
    modelProviders: [],
    sourceKinds: ALL_THREAD_SOURCE_KINDS,
    ...params,
  };
}
