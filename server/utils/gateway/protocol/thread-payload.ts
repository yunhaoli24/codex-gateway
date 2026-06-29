import type {
  ApprovalPolicy,
  GatewayEvent,
  ThreadSettingsState,
  ThreadTokenUsageState,
} from "~~/shared/types";
import { normalizeTokenUsage } from "~~/shared/token-usage";
import type { TurnStartInput } from "../runtime/types";

export function buildUserInput(input: { text: string; images?: TurnStartInput["images"] }) {
  const userInput: any[] = [];
  if (input.text.trim()) {
    userInput.push({ type: "text", text: input.text, text_elements: [] });
  }
  for (const image of input.images ?? []) {
    if (image.url) {
      userInput.push({
        type: "image",
        url: image.url,
        detail: image.detail,
      });
    } else if (image.path) {
      userInput.push({
        type: "localImage",
        path: image.path,
        detail: image.detail,
      });
    }
  }
  return userInput;
}

export function buildTurnStartParams(
  threadId: string,
  clientUserMessageId: string,
  input: TurnStartInput,
) {
  return {
    threadId,
    clientUserMessageId,
    input: buildUserInput(input),
    cwd: input.cwd || null,
    model: input.model || null,
    effort: input.effort || null,
    approvalPolicy: input.approvalPolicy || null,
    collaborationMode: input.collaborationMode
      ? {
          mode: input.collaborationMode.mode,
          settings: {
            model: input.collaborationMode.settings.model,
            reasoning_effort: input.collaborationMode.settings.reasoningEffort ?? null,
            developer_instructions: input.collaborationMode.settings.developerInstructions ?? null,
          },
        }
      : null,
  };
}

function normalizeApprovalPolicy(value: unknown): ApprovalPolicy | null {
  return value === "untrusted" || value === "on-request" || value === "never" ? value : null;
}

export function extractThreadSettings(source: any): ThreadSettingsState {
  const threadSettings = source?.threadSettings;
  return {
    model:
      typeof (threadSettings?.model ?? source?.model) === "string"
        ? (threadSettings?.model ?? source?.model)
        : null,
    effort:
      typeof (threadSettings?.effort ?? source?.reasoningEffort) === "string"
        ? (threadSettings?.effort ?? source?.reasoningEffort)
        : null,
    approvalPolicy: normalizeApprovalPolicy(
      threadSettings?.approvalPolicy ?? source?.approvalPolicy,
    ),
  };
}

export function latestTokenUsageFromEvents(events: GatewayEvent[]): ThreadTokenUsageState | null {
  for (const event of [...events].sort((left, right) => right.id - left.id)) {
    if (event.method !== "thread/tokenUsage/updated") {
      continue;
    }
    const tokenUsage = normalizeTokenUsage((event.payload as any)?.params?.tokenUsage);
    if (tokenUsage) {
      return tokenUsage;
    }
  }
  return null;
}

export function threadIdFromNotification(message: any) {
  const params = message?.params;
  return params?.threadId
    ? String(params.threadId)
    : params?.thread?.id
      ? String(params.thread.id)
      : params?.turn?.threadId
        ? String(params.turn.threadId)
        : params?.item?.threadId
          ? String(params.item.threadId)
          : null;
}
