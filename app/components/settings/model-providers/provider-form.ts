import type { ModelProvider, ModelProviderPatch } from "~~/shared/model-providers/protocol";

export function providerFormValues(provider: ModelProvider | null) {
  const settings = provider?.settings;
  return {
    name: provider?.name ?? "",
    baseUrl: provider?.baseUrl ?? "",
    envKey:
      settings?.type === "customGateway" && settings.auth.mode !== "none"
        ? (settings.auth.envKey ?? "")
        : "",
    profile: settings?.type === "bedrock" ? (settings.profile ?? "") : "",
    region: settings?.type === "bedrock" ? (settings.region ?? "") : "",
    projectId: settings?.type === "gcp" ? (settings.projectId ?? "") : "",
    location: settings?.type === "gcp" ? (settings.location ?? "") : "",
    credentialFile: settings?.type === "gcp" ? (settings.credentialFile ?? "") : "",
  };
}
export function providerFormPatch(
  provider: ModelProvider | null,
  values: ReturnType<typeof providerFormValues>,
): ModelProviderPatch {
  const before = providerFormValues(provider);
  function changed(key: keyof typeof values) {
    return before[key] === values[key]
      ? {}
      : { [key]: values[key].trim() === "" ? null : values[key].trim() };
  }
  // Send edited fields only. A redacted null URL or externally configured auth must not be
  // written back as an empty value, which would destroy hidden headers/query credentials.
  if (provider?.settings.type === "bedrock") {
    if (provider.id !== "amazon-bedrock" && provider.id !== "amazon-bedrock-runtime")
      throw new Error("Invalid Bedrock provider ID");
    return {
      type: "bedrock",
      providerId: provider.id,
      ...changed("profile"),
      ...changed("region"),
    };
  }
  if (provider?.settings.type === "gcp")
    return {
      type: "gcp",
      providerId: "gcp",
      ...changed("projectId"),
      ...changed("location"),
      ...changed("credentialFile"),
    };
  return {
    type: "customGateway",
    providerId: provider?.id,
    ...(provider === null || before.name !== values.name ? { name: values.name.trim() } : {}),
    ...(provider === null
      ? { baseUrl: values.baseUrl.trim(), envKey: values.envKey.trim() || null }
      : {
          ...changed("baseUrl"),
          ...(provider.settings.type === "customGateway" &&
          provider.settings.auth.mode === "externallyConfigured"
            ? {}
            : changed("envKey")),
        }),
  };
}
