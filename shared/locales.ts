export const gatewayLocales = [
  { code: "zh", name: "中文", file: "zh.json" },
  { code: "en", name: "English", file: "en.json" },
  { code: "de", name: "Deutsch", file: "de.json" },
] as const;

export type GatewayLocale = (typeof gatewayLocales)[number]["code"];

export function isGatewayLocale(value: unknown): value is GatewayLocale {
  return gatewayLocales.some(({ code }) => code === value);
}
