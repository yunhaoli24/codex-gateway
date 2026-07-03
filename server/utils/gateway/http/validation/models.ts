import { z } from "zod";

export const modelListSchema = z.object({
  hostId: z.coerce.number().int().positive(),
  includeHidden: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().trim().nullable().optional(),
});
