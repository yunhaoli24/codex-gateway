import { z } from "zod";

export const hostBaseSchema = z
  .object({
    name: z.string().trim().min(1),
    sshHost: z.string().trim().min(1),
    username: z.string().trim().nullable().optional(),
    port: z.preprocess(
      (value) => (value === "" || value == null ? null : value),
      z.coerce.number().int().min(1).max(65535).nullable().optional(),
    ),
    authMode: z.enum(["agent", "privateKey", "password"]).default("agent"),
    privateKeyPath: z.string().trim().nullable().optional(),
    privateKey: z.string().nullable().optional(),
    password: z.string().nullable().optional(),
    proxyUrl: z.string().trim().nullable().optional().default("socks5h://127.0.0.1:7890"),
  })
  .strict();

export function validateHostProxy(host: z.infer<typeof hostBaseSchema>, ctx: z.RefinementCtx) {
  if (!host.proxyUrl) {
    return;
  }
  try {
    const url = new URL(host.proxyUrl);
    if (url.protocol !== "socks5:" && url.protocol !== "socks5h:") {
      throw new Error("Unsupported proxy protocol");
    }
    if (!url.hostname || !url.port) {
      throw new Error("Proxy host and port are required");
    }
  } catch {
    ctx.addIssue({
      code: "custom",
      path: ["proxyUrl"],
      message: "Proxy URL must look like socks5h://127.0.0.1:7890",
    });
  }
}

export const hostCreateSchema = hostBaseSchema.superRefine(validateHostProxy);
export const hostUpdateSchema = hostBaseSchema.superRefine(validateHostProxy);

export const projectCreateSchema = z.object({
  hostId: z.coerce.number().int().positive(),
  name: z.string().trim().min(1),
  remotePath: z.string().trim().min(1),
});

export const projectUpdateSchema = projectCreateSchema;
