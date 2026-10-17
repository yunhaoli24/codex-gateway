import { z } from "zod";
import type { UploadedFileRecord } from "../types/files";

export const uploadedFileSchema: z.ZodType<UploadedFileRecord> = z
  .object({
    path: z.string().min(1),
    name: z.string().min(1),
    mimeType: z.string().nullable().optional(),
    size: z.number().int().nonnegative(),
    isImage: z.boolean(),
  })
  .strict();
