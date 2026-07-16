import { z } from "zod";

export const createTmuxMonitorSchema = z.object({
  sessionId: z.string().trim().min(1).max(128),
  paneId: z.string().trim().min(1).max(128),
});
