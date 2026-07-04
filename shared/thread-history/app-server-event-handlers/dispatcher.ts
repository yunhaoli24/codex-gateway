import { EventEmitter } from "@posva/event-emitter";
import type {
  AppServerEventParams,
  AppServerHistoryReducer,
  AppServerHistoryReducerRegistry,
  AppServerRequestId,
  ApplyAppServerEventInput,
} from "./types";

interface ReducerEnvelope {
  input: ApplyAppServerEventInput;
  params: AppServerEventParams;
  requestId: AppServerRequestId;
  handled: boolean;
  result: unknown;
}

type ReducerEventMap = Record<string, ReducerEnvelope>;

export class AppServerHistoryDispatcher {
  private readonly emitter = new EventEmitter<ReducerEventMap>();

  constructor(registry: AppServerHistoryReducerRegistry) {
    this.register(registry);
  }

  reduce(
    method: string,
    input: ApplyAppServerEventInput,
    params: AppServerEventParams,
    requestId: AppServerRequestId,
  ) {
    const envelope: ReducerEnvelope = {
      input,
      params,
      requestId,
      handled: false,
      result: input.history,
    };
    this.emitter.emit(method, envelope);
    return envelope.handled ? envelope.result : input.history;
  }

  private register(registry: AppServerHistoryReducerRegistry) {
    Object.entries(registry).forEach(([method, reducer]) => this.on(method, reducer));
  }

  private on(method: string, reducer: AppServerHistoryReducer) {
    this.emitter.on(method, (envelope) => {
      envelope.handled = true;
      envelope.result = reducer(envelope.input, envelope.params, envelope.requestId);
    });
  }
}
