import { z } from "zod";

const auth = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("none") }).strict(),
  z.object({ mode: z.literal("environmentVariable"), envKey: z.string() }).strict(),
  z.object({ mode: z.literal("externallyConfigured"), envKey: z.string().nullable() }).strict(),
]);
export const modelProviderSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    canEdit: z.boolean(),
    baseUrl: z.string().nullable(),
    settings: z.discriminatedUnion("type", [
      z.object({ type: z.literal("openai") }).strict(),
      z.object({ type: z.literal("customGateway"), auth }).strict(),
      z
        .object({
          type: z.literal("bedrock"),
          profile: z.string().nullable(),
          region: z.string().nullable(),
        })
        .strict(),
      z
        .object({
          type: z.literal("gcp"),
          projectId: z.string().nullable(),
          location: z.string().nullable(),
          credentialFile: z.string().nullable(),
        })
        .strict(),
    ]),
  })
  .strict();
export const modelProviderListSchema = z
  .object({
    data: z.array(modelProviderSchema),
    defaultProviderId: z.string(),
    canChangeDefault: z.boolean(),
  })
  .strict();
const nullablePatch = z.string().nullable().optional();
export const modelProviderPatchSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("customGateway"),
      providerId: nullablePatch,
      name: z.string().optional(),
      baseUrl: nullablePatch,
      envKey: nullablePatch,
    })
    .strict(),
  z
    .object({
      type: z.literal("bedrock"),
      providerId: z.enum(["amazon-bedrock", "amazon-bedrock-runtime"]),
      profile: nullablePatch,
      region: nullablePatch,
    })
    .strict(),
  z
    .object({
      type: z.literal("gcp"),
      providerId: z.literal("gcp"),
      projectId: nullablePatch,
      location: nullablePatch,
      credentialFile: nullablePatch,
    })
    .strict(),
]);
export const gatewayOAuthReadSchema = z
  .object({
    providerId: z.string(),
    providerName: z.string(),
    required: z.boolean(),
    supportsDeviceAuth: z.boolean().optional(),
    status: z.enum(["notReady", "started", "succeeded", "failed"]).nullable(),
    error: z.string().nullable(),
  })
  .strict();
export const gatewayOAuthLoginSchema = z
  .object({
    prompt: z
      .object({ loginId: z.string(), verificationUrl: z.url(), userCode: z.string() })
      .strict()
      .nullable(),
  })
  .strict();

// A domain-specific command union keeps the WS bus typed without exposing an arbitrary RPC proxy.
export const modelProviderOperationSchema = z.discriminatedUnion("method", [
  z.object({ method: z.literal("list") }).strict(),
  z.object({ method: z.literal("write"), settings: modelProviderPatchSchema }).strict(),
  z.object({ method: z.literal("select"), providerId: z.string().min(1) }).strict(),
  z.object({ method: z.literal("auth.read"), providerId: z.string().min(1) }).strict(),
  z.object({ method: z.literal("auth.login"), providerId: z.string().min(1) }).strict(),
  z.object({ method: z.literal("auth.cancel") }).strict(),
]);
export const modelProviderResultSchema = z.discriminatedUnion("method", [
  z.object({ method: z.literal("list"), value: modelProviderListSchema }).strict(),
  z
    .object({
      method: z.literal("write"),
      value: z.object({ provider: modelProviderSchema }).strict(),
    })
    .strict(),
  z.object({ method: z.literal("select") }).strict(),
  z.object({ method: z.literal("auth.read"), value: gatewayOAuthReadSchema }).strict(),
  z.object({ method: z.literal("auth.login"), value: gatewayOAuthLoginSchema }).strict(),
  z.object({ method: z.literal("auth.cancel") }).strict(),
]);
export type ModelProvider = z.infer<typeof modelProviderSchema>;
export type ModelProviderPatch = z.infer<typeof modelProviderPatchSchema>;
export type ModelProviderOperation = z.infer<typeof modelProviderOperationSchema>;
export type ModelProviderResult = z.infer<typeof modelProviderResultSchema>;
