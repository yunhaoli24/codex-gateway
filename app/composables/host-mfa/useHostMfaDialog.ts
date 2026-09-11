import { inject, provide, ref, type InjectionKey, type Ref } from "vue";

export interface HostMfaDialogState {
  /** The host ID currently being prompted for MFA, or null if none */
  mfaDialogHostId: Ref<number | null>;
  /** Open the MFA dialog for the given host */
  openMfaDialog: (hostId: number) => void;
  /** Close the MFA dialog */
  closeMfaDialog: () => void;
}

const HOST_MFA_DIALOG_KEY: InjectionKey<HostMfaDialogState> = Symbol("host-mfa-dialog");

/**
 * Creates and provides the MFA dialog state.
 * Should be called once in GatewaySidebar.vue.
 */
export function provideHostMfaDialog(): HostMfaDialogState {
  const mfaDialogHostId = ref<number | null>(null);

  const state: HostMfaDialogState = {
    mfaDialogHostId,
    openMfaDialog(hostId: number) {
      mfaDialogHostId.value = hostId;
    },
    closeMfaDialog() {
      mfaDialogHostId.value = null;
    },
  };

  provide(HOST_MFA_DIALOG_KEY, state);
  return state;
}

/**
 * Injects the MFA dialog state in child components.
 * Throws if called outside a component that has provideHostMfaDialog() ancestor.
 */
export function useHostMfaDialog(): HostMfaDialogState {
  const state = inject(HOST_MFA_DIALOG_KEY);
  if (!state) {
    throw new Error(
      "useHostMfaDialog() must be used within a component that provides it via provideHostMfaDialog()",
    );
  }
  return state;
}
