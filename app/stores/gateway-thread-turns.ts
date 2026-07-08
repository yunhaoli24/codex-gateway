import { defineStore } from "pinia";
import { reactive, toRefs } from "vue";
import type { ComposerTurnOptions } from "~~/shared/types";
import { pinnedKey } from "./gateway/thread-utils/identity";
import { createGatewayThreadTurnActions } from "./gateway-thread-turns/actions";

export interface SubmittedTurnRequestState {
  kind: "start" | "steer";
  hostId: number;
  projectId: number | null;
  threadId: string;
  cwd: string | null;
  text: string;
  options: ComposerTurnOptions;
  retryCount: number;
  pendingRetryTurnId: string | null;
  retryTimer: number | null;
}

export type SubmittedTurnRequestInput = Omit<
  SubmittedTurnRequestState,
  "retryCount" | "pendingRetryTurnId" | "retryTimer"
>;

export const useGatewayThreadTurnsStore = defineStore("gateway-thread-turns", () => {
  const state = reactive({
    submittedTurnRequestsByKey: {} as Record<string, SubmittedTurnRequestState>,
  });

  function requestKey(hostId: number, threadId: string) {
    return pinnedKey(hostId, threadId);
  }

  function requestForThread(hostId: number, threadId: string) {
    return state.submittedTurnRequestsByKey[requestKey(hostId, threadId)];
  }

  function rememberRequest(input: SubmittedTurnRequestInput) {
    const key = requestKey(input.hostId, input.threadId);
    const existing = state.submittedTurnRequestsByKey[key];
    if (existing?.retryTimer) {
      clearTimeout(existing.retryTimer);
    }
    state.submittedTurnRequestsByKey = {
      ...state.submittedTurnRequestsByKey,
      [key]: {
        ...input,
        retryCount: 0,
        pendingRetryTurnId: null,
        retryTimer: null,
      },
    };
  }

  function clearRequest(hostId: number, threadId: string) {
    const key = requestKey(hostId, threadId);
    const existing = state.submittedTurnRequestsByKey[key];
    if (existing?.retryTimer) {
      clearTimeout(existing.retryTimer);
    }
    const { [key]: _removed, ...remaining } = state.submittedTurnRequestsByKey;
    state.submittedTurnRequestsByKey = remaining;
  }

  function patchRequest(
    hostId: number,
    threadId: string,
    patch: Partial<SubmittedTurnRequestState>,
  ) {
    const key = requestKey(hostId, threadId);
    const current = state.submittedTurnRequestsByKey[key];
    if (!current) {
      return;
    }
    state.submittedTurnRequestsByKey = {
      ...state.submittedTurnRequestsByKey,
      [key]: {
        ...current,
        ...patch,
      },
    };
  }

  function setRequest(key: string, request: SubmittedTurnRequestState) {
    state.submittedTurnRequestsByKey = {
      ...state.submittedTurnRequestsByKey,
      [key]: request,
    };
  }

  function requestByKey(key: string) {
    return state.submittedTurnRequestsByKey[key];
  }

  function resetState() {
    for (const request of Object.values(state.submittedTurnRequestsByKey)) {
      if (request.retryTimer) {
        clearTimeout(request.retryTimer);
      }
    }
    state.submittedTurnRequestsByKey = {};
  }

  const actions = createGatewayThreadTurnActions();

  return {
    ...toRefs(state),
    requestKey,
    requestForThread,
    rememberRequest,
    clearRequest,
    patchRequest,
    setRequest,
    requestByKey,
    resetState,
    ...actions,
  };
});
