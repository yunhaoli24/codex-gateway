/// <reference types="node" />

import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { hostLifecycleMessageSchema } from "../shared/host-lifecycle-message.ts";
import { notificationTranslationSchema } from "../shared/notifications/messages.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
function flatten(value: unknown, prefix = ""): Record<string, string> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid translation object: ${prefix}`);
  }
  const messages: Record<string, string> = {};
  for (const [key, message] of Object.entries(value)) {
    if (typeof message === "string") messages[`${prefix}${key}`] = message;
    else Object.assign(messages, flatten(message, `${prefix}${key}.`));
  }
  return messages;
}

const locales = await Promise.all(
  ["en", "zh"].map(async (locale) => ({
    locale,
    messages: flatten(
      JSON.parse(await readFile(path.join(root, `i18n/locales/${locale}.json`), "utf8")),
    ),
  })),
);
const errors: string[] = [];
const keys = new Set(locales.flatMap(({ messages }) => Object.keys(messages)));
const dynamicKeys = [
  ...hostLifecycleMessageSchema.shape.key.options.map((key) => `app.hostLifecycle.${key}`),
  ...notificationTranslationSchema.shape.kind.options.flatMap((kind) => [
    `app.serverNotifications.${kind}.title`,
    `app.serverNotifications.${kind}.body`,
  ]),
];
for (const key of dynamicKeys) {
  if (!keys.has(key)) errors.push(`Missing dynamic translation: ${key}`);
}
for (const key of keys) {
  const placeholders: string[] = [];
  for (const { locale, messages } of locales) {
    const message = messages[key];
    if (message === undefined) errors.push(`${locale}: missing ${key}`);
    else
      placeholders.push(
        [...new Set([...message.matchAll(/\{([A-Za-z0-9_]+)\}/g)].map((match) => match[1]))]
          .sort((left, right) => left.localeCompare(right))
          .join(","),
      );
  }
  if (new Set(placeholders).size > 1) errors.push(`${key}: translation placeholders differ`);
}

async function checkReferences(directory: string): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (["node_modules", "dist"].includes(entry.name)) continue;
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) await checkReferences(filename);
    else if (/\.(ts|vue)$/.test(entry.name)) {
      const source = await readFile(filename, "utf8");
      for (const match of source.matchAll(/["'`](app\.[A-Za-z0-9_.]+)["'`]/g)) {
        if (!keys.has(match[1]))
          errors.push(`${path.relative(root, filename)}: missing ${match[1]}`);
      }
    }
  }
}
for (const directory of ["app", "server", "shared"])
  await checkReferences(path.join(root, directory));
if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else
  console.log(
    `Checked ${keys.size} translation keys in both locales and literal interface references.`,
  );
