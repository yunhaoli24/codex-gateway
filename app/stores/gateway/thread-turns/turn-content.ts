import type { ComposerTurnOptions } from "~~/shared/types";

export function optimisticUserContent(text: string, options: ComposerTurnOptions) {
  const imageContent = (options.images ?? []).map((image) =>
    image.url
      ? { type: "image", url: image.url, detail: image.detail }
      : { type: "localImage", path: image.path, detail: image.detail },
  );
  return [text ? { type: "text", text, text_elements: [] } : null, ...imageContent].filter(Boolean);
}

export function createClientUserMessageId(kind: "steer" | "turn") {
  return `${kind}-${globalThis.crypto?.randomUUID?.() || Date.now()}`;
}
