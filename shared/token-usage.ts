import type { ThreadTokenUsageState, TokenUsageBreakdown } from "./types";

export function normalizeTokenUsage(value: any): ThreadTokenUsageState | null {
  const total = normalizeTokenBreakdown(value?.total);
  const last = normalizeTokenBreakdown(value?.last);
  if (!total || !last) {
    return null;
  }
  return {
    total,
    last,
    modelContextWindow: numberOrNull(value?.modelContextWindow ?? value?.model_context_window),
  };
}

function normalizeTokenBreakdown(value: any): TokenUsageBreakdown | null {
  const totalTokens = numberOrNull(value?.totalTokens ?? value?.total_tokens);
  const inputTokens = numberOrNull(value?.inputTokens ?? value?.input_tokens);
  const cachedInputTokens = numberOrNull(value?.cachedInputTokens ?? value?.cached_input_tokens);
  const outputTokens = numberOrNull(value?.outputTokens ?? value?.output_tokens);
  const reasoningOutputTokens = numberOrNull(
    value?.reasoningOutputTokens ?? value?.reasoning_output_tokens,
  );
  if (
    [totalTokens, inputTokens, cachedInputTokens, outputTokens, reasoningOutputTokens].some(
      (item) => item == null,
    )
  ) {
    return null;
  }
  return {
    totalTokens,
    inputTokens,
    cachedInputTokens,
    outputTokens,
    reasoningOutputTokens,
  };
}

function numberOrNull(value: unknown) {
  if (value == null) {
    return null;
  }
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}
