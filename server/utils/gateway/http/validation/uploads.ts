import { z } from "zod";

export const uploadQuerySchema = z.object({
  hostId: z.coerce.number().int().positive(),
});
