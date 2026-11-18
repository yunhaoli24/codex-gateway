import { z } from "zod";

export const threadEnvironmentSchema = z
  .object({
    environmentId: z.string().min(1),
    cwd: z.string().min(1),
    runtimeWorkspaceRoots: z.array(z.string().min(1)),
  })
  .strict();

export const turnEnvironmentParamsSchema = threadEnvironmentSchema.extend({
  runtimeWorkspaceRoots: z.array(z.string().min(1)).nullable().optional(),
});
export type ThreadEnvironment = z.infer<typeof threadEnvironmentSchema>;
export type TurnEnvironmentParams = z.infer<typeof turnEnvironmentParamsSchema>;
