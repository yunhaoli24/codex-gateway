import { EventEmitter } from "@posva/event-emitter";
import type { RealtimeClientMessage } from "~~/shared/types";
import { runPeerScoped, stateFor, type RealtimePeer } from "./peer-state";

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

type RealtimeMessageEnvelope<K extends keyof RealtimeClientMessageMap> = {
  peer: RealtimePeer;
  request: RealtimeClientMessageMap[K];
  accept: (task: Promise<void>) => void;
};

type RealtimeMessageEnvelopeMap = {
  [K in keyof RealtimeClientMessageMap]: RealtimeMessageEnvelope<K>;
};

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
  private readonly emitter = new EventEmitter<RealtimeMessageEnvelopeMap>();
  private readonly authRequirements = new Map<
    keyof RealtimeClientMessageMap,
    RealtimeMessageAuth
  >();

  constructor(handlers: RealtimeMessageHandlerRegistry) {
    this.register(handlers);
  }

  dispatch(peer: RealtimePeer, request: RealtimeClientMessage) {
    this.assertCanDispatch(peer, request.type);
    return new Promise<void>((resolve, reject) => {
      let handled = false;
      const envelope = {
        peer,
        request,
        accept: (handlerTask: Promise<void>) => {
          handled = true;
          handlerTask.then(resolve, reject);
        },
      } as RealtimeMessageEnvelope<keyof RealtimeClientMessageMap>;
      try {
        this.emitter.emit(request.type, envelope as never);
      } catch (error) {
        reject(error);
        return;
      }
      if (!handled) {
        reject(new Error(`Unsupported realtime message: ${request.type}`));
      }
    });
  }

  private register(handlers: RealtimeMessageHandlerRegistry) {
    Object.entries(handlers).forEach(([type, entry]) => {
      this.on(type as keyof RealtimeClientMessageMap, entry as never);
    });
  }

  private on<K extends keyof RealtimeClientMessageMap>(
    type: K,
    entry: RealtimeMessageHandlerEntry<K>,
  ) {
    const normalized = normalizeHandlerEntry(entry);
    this.authRequirements.set(type, normalized.auth);
    this.emitter.on(type, (envelope) => {
      envelope.accept(
        Promise.resolve(this.runHandler(normalized.handler, envelope.peer, envelope.request)),
      );
    });
  }

  private runHandler<K extends keyof RealtimeClientMessageMap>(
    handler: RealtimeMessageHandler<K>,
    peer: RealtimePeer,
    request: RealtimeClientMessageMap[K],
  ) {
    return stateFor(peer).authenticated
      ? runPeerScoped(peer, () => handler(peer, request))
      : handler(peer, request);
  }

  private assertCanDispatch(peer: RealtimePeer, type: keyof RealtimeClientMessageMap) {
    const auth = this.authRequirements.get(type);
    if (!auth) {
      throw new Error(`Unsupported realtime message: ${type}`);
    }
    if (auth === "authenticated" && !stateFor(peer).authenticated) {
      throw new RealtimeAuthenticationRequiredError();
    }
  }
}

function normalizeHandlerEntry<K extends keyof RealtimeClientMessageMap>(
  entry: RealtimeMessageHandlerEntry<K>,
): { auth: RealtimeMessageAuth; handler: RealtimeMessageHandler<K> } {
  return typeof entry === "function" ? { auth: "authenticated", handler: entry } : entry;
}
