import { inject, provide, ref, type InjectionKey, type Ref } from "vue";

const defaultMessages = {
  close: "Close",
  loading: "Loading",
  sidebar: "Sidebar",
  sidebarDescription: "Displays the mobile sidebar.",
  toggleSidebar: "Toggle sidebar",
  togglePlan: "Toggle plan",
  preview: "Preview",
  modelContextUsage: "Model context usage",
};

export type UiMessages = typeof defaultMessages;

const uiMessagesKey: InjectionKey<Readonly<Ref<UiMessages>>> = Symbol("gateway-ui-messages");

export function provideUiMessages(messages: Readonly<Ref<UiMessages>>) {
  provide(uiMessagesKey, messages);
}

export function useUiMessages() {
  return inject(uiMessagesKey, () => ref(defaultMessages), true);
}
