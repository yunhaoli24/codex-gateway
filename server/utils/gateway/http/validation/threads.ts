import { z } from "zod";
import { INITIAL_TURN_PAGE_LIMIT, OLDER_TURN_PAGE_LIMIT } from "~~/shared/config";
import { optionalPositiveInt } from "./common";

export const threadListSchema = z.object({
  hostId: z.coerce.number().int().positive(),
  projectId: optionalPositiveInt,
  cwd: z.string().trim().nullable().optional(),
  searchTerm: z.string().trim().nullable().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  cursor: z.string().trim().nullable().optional(),
  useRemoteStateIndexOnly: z.coerce.boolean().optional(),
});

export const threadOpenSchema = z.object({
  hostId: z.coerce.number().int().positive(),
  projectId: optionalPositiveInt,
  threadId: z.string().trim().min(1),
  limit: z.coerce.number().int().min(1).max(100).default(INITIAL_TURN_PAGE_LIMIT),
});

export const threadTurnsListSchema = z.object({
  hostId: z.coerce.number().int().positive(),
  threadId: z.string().trim().min(1),
  cursor: z.string().trim().nullable().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(OLDER_TURN_PAGE_LIMIT),
  sortDirection: z.enum(["asc", "desc"]).default("desc"),
});

export const threadRenameSchema = z.object({
  hostId: z.coerce.number().int().positive(),
  threadId: z.string().trim().min(1),
  name: z.string().trim().min(1).max(200),
});

export const threadSettingFields = {
  model: z.string().trim().nullable().optional(),
  effort: z.string().trim().min(1).nullable().optional(),
  approvalPolicy: z.enum(["untrusted", "on-request", "never"]).nullable().optional(),
};

const collaborationModeSchema = z
  .object({
    mode: z.enum(["default", "plan"]),
    settings: z.object({
      model: z.string().trim().min(1),
      reasoningEffort: z.string().trim().min(1).nullable().optional(),
      developerInstructions: z.string().nullable().optional(),
    }),
  })
  .nullable()
  .optional();

const imageInputSchema = z
  .object({
    path: z.string().trim().min(1).optional(),
    url: z.string().trim().min(1).optional(),
    detail: z.enum(["low", "high", "auto", "original"]).optional(),
  })
  .refine((image) => Boolean(image.path || image.url), {
    message: "Image must include path or url",
  });

export const threadStartSchema = z.object({
  hostId: z.coerce.number().int().positive(),
  projectId: optionalPositiveInt,
  cwd: z.string().trim().nullable().optional(),
  ...threadSettingFields,
});

export const threadSettingsUpdateSchema = z.object({
  hostId: z.coerce.number().int().positive(),
  threadId: z.string().trim().min(1),
  ...threadSettingFields,
});

export const turnStartSchema = z.object({
  hostId: z.coerce.number().int().positive(),
  threadId: z.string().trim().min(1),
  text: z.string().trim().default(""),
  clientUserMessageId: z.string().trim().nullable().optional(),
  cwd: z.string().trim().nullable().optional(),
  ...threadSettingFields,
  collaborationMode: collaborationModeSchema,
  images: z.array(imageInputSchema).default([]),
  files: z
    .array(
      z.object({
        path: z.string().trim().min(1),
        name: z.string().trim().min(1),
        mimeType: z.string().trim().nullable().optional(),
        size: z.coerce.number().int().min(0),
        isImage: z.boolean(),
      }),
    )
    .default([]),
});

export const turnSteerSchema = z.object({
  hostId: z.coerce.number().int().positive(),
  threadId: z.string().trim().min(1),
  expectedTurnId: z.string().trim().min(1),
  text: z.string().trim().default(""),
  clientUserMessageId: z.string().trim().nullable().optional(),
  images: z.array(imageInputSchema).default([]),
});

export const turnInterruptSchema = z.object({
  hostId: z.coerce.number().int().positive(),
  threadId: z.string().trim().min(1),
  turnId: z.string().trim().min(1),
});

export const serverRequestResponseSchema = z
  .object({
    hostId: z.coerce.number().int().positive(),
    threadId: z.string().trim().min(1),
    requestId: z.union([z.string().trim().min(1), z.number().int()]),
    result: z.unknown().optional(),
    error: z
      .object({
        code: z.coerce.number().int(),
        message: z.string().trim().min(1),
        data: z.unknown().optional(),
      })
      .optional(),
  })
  .refine((input) => !(input.result !== undefined && input.error), {
    message: "Provide either result or error, not both",
  });
