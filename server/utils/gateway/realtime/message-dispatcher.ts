import type { RealtimeClientMessage } from "~~/shared/types";
import { runPeerScoped, stateFor, type RealtimePeer } from "./peer-state";
import { match } from "ts-pattern";

export type RealtimeClientMessageMap = {
  [K in RealtimeClientMessage["type"]]: Extract<RealtimeClientMessage, { type: K }>;
};

export type RealtimeMessageHandler<K extends keyof RealtimeClientMessageMap> = (
  peer: RealtimePeer,
  request: RealtimeClientMessageMap[K],
) => void | Promise<void>;

export type RealtimeMessageAuth = "public" | "authenticated";

export interface RealtimeAuthenticationRequiredErrorDetails {
  message: string;
}

export class RealtimeAuthenticationRequiredError extends Error {
  constructor() {
    super("Realtime connection is not authenticated");
    this.name = "RealtimeAuthenticationRequiredError";
  }
}

type RealtimeMessageHandlerEntry<K extends keyof RealtimeClientMessageMap> =
  | RealtimeMessageHandler<K>
  | {
      auth: RealtimeMessageAuth;
      handler: RealtimeMessageHandler<K>;
    };

type RealtimeMessageHandlerRegistry = {
  [K in keyof RealtimeClientMessageMap]?: RealtimeMessageHandlerEntry<K>;
};

export class RealtimeMessageDispatcher {
  constructor(private readonly handlers: RealtimeMessageHandlerRegistry) {}

  dispatch(peer: RealtimePeer, request: RealtimeClientMessage) {
    return match(request)
      .with({ type: "auth.authenticate" }, (value) =>
        this.dispatchEntry(peer, value, this.handlers[value.type]),
      )
      .with({ type: "browser.allowInsecureTls" }, (value) =>
        this.dispatchEntry(peer, value, this.handlers[value.type]),
      )
      .with({ type: "browser.close" }, (value) =>
        this.dispatchEntry(peer, value, this.handlers[value.type]),
      )
      .with({ type: "browser.open" }, (value) =>
        this.dispatchEntry(peer, value, this.handlers[value.type]),
      )
      .with({ type: "host.lifecycle.subscribe" }, (value) =>
        this.dispatchEntry(peer, value, this.handlers[value.type]),
      )
      .with({ type: "file.git.compare" }, (value) =>
        this.dispatchEntry(peer, value, this.handlers[value.type]),
      )
      .with({ type: "file.git.workspace.inspect" }, (value) =>
        this.dispatchEntry(peer, value, this.handlers[value.type]),
      )
      .with({ type: "file.search" }, (value) =>
        this.dispatchEntry(peer, value, this.handlers[value.type]),
      )
      .with({ type: "file.watch.subscribe" }, (value) =>
        this.dispatchEntry(peer, value, this.handlers[value.type]),
      )
      .with({ type: "file.watch.unsubscribe" }, (value) =>
        this.dispatchEntry(peer, value, this.handlers[value.type]),
      )
      .with({ type: "host.lifecycle.unsubscribe" }, (value) =>
        this.dispatchEntry(peer, value, this.handlers[value.type]),
      )
      .with({ type: "host.metrics.subscribe" }, (value) =>
        this.dispatchEntry(peer, value, this.handlers[value.type]),
      )
      .with({ type: "host.metrics.unsubscribe" }, (value) =>
        this.dispatchEntry(peer, value, this.handlers[value.type]),
      )
      .with({ type: "project.defaults.read" }, (value) =>
        this.dispatchEntry(peer, value, this.handlers[value.type]),
      )
      .with({ type: "tmux.sessions.subscribe" }, (value) =>
        this.dispatchEntry(peer, value, this.handlers[value.type]),
      )
      .with({ type: "tmux.sessions.refresh" }, (value) =>
        this.dispatchEntry(peer, value, this.handlers[value.type]),
      )
      .with({ type: "tmux.sessions.unsubscribe" }, (value) =>
        this.dispatchEntry(peer, value, this.handlers[value.type]),
      )
      .with({ type: "ping" }, (value) => this.dispatchEntry(peer, value, this.handlers[value.type]))
      .with({ type: "mcp.status.list" }, (value) =>
        this.dispatchEntry(peer, value, this.handlers[value.type]),
      )
      .with({ type: "mcp.event.stream.start" }, (value) =>
        this.dispatchEntry(peer, value, this.handlers[value.type]),
      )
      .with({ type: "mcp.event.stream.stop" }, (value) =>
        this.dispatchEntry(peer, value, this.handlers[value.type]),
      )
      .with({ type: "serverRequest.respond" }, (value) =>
        this.dispatchEntry(peer, value, this.handlers[value.type]),
      )
      .with({ type: "terminal.close" }, (value) =>
        this.dispatchEntry(peer, value, this.handlers[value.type]),
      )
      .with({ type: "terminal.input" }, (value) =>
        this.dispatchEntry(peer, value, this.handlers[value.type]),
      )
      .with({ type: "terminal.list" }, (value) =>
        this.dispatchEntry(peer, value, this.handlers[value.type]),
      )
      .with({ type: "terminal.open" }, (value) =>
        this.dispatchEntry(peer, value, this.handlers[value.type]),
      )
      .with({ type: "terminal.resize" }, (value) =>
        this.dispatchEntry(peer, value, this.handlers[value.type]),
      )
      .with({ type: "thread.activate" }, (value) =>
        this.dispatchEntry(peer, value, this.handlers[value.type]),
      )
      .with({ type: "thread.goal.clear" }, (value) =>
        this.dispatchEntry(peer, value, this.handlers[value.type]),
      )
      .with({ type: "thread.goal.get" }, (value) =>
        this.dispatchEntry(peer, value, this.handlers[value.type]),
      )
      .with({ type: "thread.goal.set" }, (value) =>
        this.dispatchEntry(peer, value, this.handlers[value.type]),
      )
      .with({ type: "thread.start" }, (value) =>
        this.dispatchEntry(peer, value, this.handlers[value.type]),
      )
      .with({ type: "thread.subscribe" }, (value) =>
        this.dispatchEntry(peer, value, this.handlers[value.type]),
      )
      .with({ type: "thread.turns.load" }, (value) =>
        this.dispatchEntry(peer, value, this.handlers[value.type]),
      )
      .with({ type: "thread.items.load" }, (value) =>
        this.dispatchEntry(peer, value, this.handlers[value.type]),
      )
      .with({ type: "thread.unsubscribe" }, (value) =>
        this.dispatchEntry(peer, value, this.handlers[value.type]),
      )
      .with({ type: "turn.interrupt" }, (value) =>
        this.dispatchEntry(peer, value, this.handlers[value.type]),
      )
      .with({ type: "turn.settings.update" }, (value) =>
        this.dispatchEntry(peer, value, this.handlers[value.type]),
      )
      .with({ type: "turn.start" }, (value) =>
        this.dispatchEntry(peer, value, this.handlers[value.type]),
      )
      .with({ type: "turn.steer" }, (value) =>
        this.dispatchEntry(peer, value, this.handlers[value.type]),
      )
      .exhaustive();
  }

  private dispatchEntry<K extends keyof RealtimeClientMessageMap>(
    peer: RealtimePeer,
    request: RealtimeClientMessageMap[K],
    entry: RealtimeMessageHandlerEntry<K> | undefined,
  ) {
    if (entry === undefined) {
      return Promise.reject(new Error(`Unsupported realtime message: ${request.type}`));
    }
    const normalized = normalizeHandlerEntry(entry);
    if (normalized.auth === "authenticated" && !stateFor(peer).authenticated) {
      throw new RealtimeAuthenticationRequiredError();
    }
    const task = stateFor(peer).authenticated
      ? runPeerScoped(peer, () => normalized.handler(peer, request))
      : normalized.handler(peer, request);
    return Promise.resolve(task);
  }
}

function normalizeHandlerEntry<K extends keyof RealtimeClientMessageMap>(
  entry: RealtimeMessageHandlerEntry<K>,
): { auth: RealtimeMessageAuth; handler: RealtimeMessageHandler<K> } {
  return typeof entry === "function" ? { auth: "authenticated", handler: entry } : entry;
}
