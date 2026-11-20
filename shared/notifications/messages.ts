import { z } from "zod";

export const notificationTranslationSchema = z
  .object({
    kind: z.enum(["turnCompleted", "goalCompleted", "inputRequested", "tmuxCompleted"]),
    values: z.record(z.string(), z.union([z.string(), z.number()])),
  })
  .strict();

export type NotificationTranslation = z.infer<typeof notificationTranslationSchema>;
