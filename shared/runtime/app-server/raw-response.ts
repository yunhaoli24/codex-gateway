import { z } from "zod";

const rawResponseCompletedSchema = z
  .object({
    threadId: z.string().min(1),
    turnId: z.string().min(1),
    responseId: z.string().min(1),
    usage: z.unknown().nullable(),
    usageMetadata: z
      .object({
        amount: z.string().nullable(),
        metadata: z.json().nullable(),
      })
      .strict()
      .nullable(),
  })
  .strict();

export function rawResponseCompletedFromUnknown(value: unknown) {
  const parsed = rawResponseCompletedSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
