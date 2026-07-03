import { z } from "zod";

export const remoteDirectoryListSchema = z.object({
  hostId: z.coerce.number().int().positive(),
  path: z.string().trim().default("~"),
});

export const remoteImageSchema = z.object({
  hostId: z.coerce.number().int().positive(),
  path: z
    .string()
    .trim()
    .min(1)
    .refine((path) => path.startsWith("/"), {
      message: "Remote image path must be absolute",
    }),
});
