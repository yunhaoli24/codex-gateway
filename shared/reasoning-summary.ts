import { z } from "zod";

// These are Codex's ReasoningSummary wire values, independent of reasoning effort.
export const reasoningSummarySchema = z.enum(["auto", "concise", "detailed", "none"]);
export type ReasoningSummary = z.infer<typeof reasoningSummarySchema>;

// Explicit opt-in matters: omitting summary uses the model catalog default, which may be "none".
// Let the upstream model choose its supported summarizer instead of forcing "detailed" globally.
export const DEFAULT_REASONING_SUMMARY: ReasoningSummary = "auto";
