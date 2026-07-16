import { z } from "zod";

export const createTmuxMonitorSchema = z.object({
  sessionId: z.string().trim().min(1).max(128),
  paneId: z.string().trim().min(1).max(128),
  thread: z
    .object({
      projectId: z.number().int().positive().nullable(),
      threadId: z.string().trim().min(1).max(128),
      threadTitle: z.string().trim().min(1).max(500),
    })
    .nullable()
    .optional(),
});

export const tmuxPaneOutputQuerySchema = z.object({
  sessionId: z.string().trim().min(1).max(128),
  paneId: z.string().trim().min(1).max(128),
});
