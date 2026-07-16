import type { ITheme } from "@xterm/xterm";

import { useMutationObserver, usePreferredDark } from "@vueuse/core";
import { computed, onMounted, ref } from "vue";

const lightTerminalTheme: ITheme = {
  background: "#ffffff",
  foreground: "#000000",
  cursor: "#000000",
  cursorAccent: "#ffffff",
  selectionBackground: "rgba(0, 117, 222, 0.25)",
  selectionInactiveBackground: "rgba(0, 117, 222, 0.15)",
  scrollbarSliderBackground: "rgba(0, 0, 0, 0.18)",
  scrollbarSliderHoverBackground: "rgba(0, 0, 0, 0.34)",
  black: "#000000",
  red: "#be524b",
  green: "#1aae39",
  yellow: "#dd5b00",
  blue: "#0075de",
  magenta: "#865dbb",
  cyan: "#2a9d99",
  white: "#ffffff",
  brightBlack: "#615d59",
  brightRed: "#be524b",
  brightGreen: "#1aae39",
  brightYellow: "#dd5b00",
  brightBlue: "#0075de",
  brightMagenta: "#865dbb",
  brightCyan: "#2a9d99",
  brightWhite: "#000000",
};

const darkTerminalTheme: ITheme = {
  background: "#191919",
  foreground: "#f1f1ef",
  cursor: "#f1f1ef",
  cursorAccent: "#191919",
  selectionBackground: "rgba(68, 122, 203, 0.32)",
  selectionInactiveBackground: "rgba(68, 122, 203, 0.18)",
  scrollbarSliderBackground: "rgba(241, 241, 239, 0.18)",
  scrollbarSliderHoverBackground: "rgba(241, 241, 239, 0.34)",
  black: "#191919",
  red: "#be524b",
  green: "#4f9768",
  yellow: "#cb7b37",
  blue: "#447acb",
  magenta: "#865dbb",
  cyan: "#4f9d99",
  white: "#f1f1ef",
  brightBlack: "#6f6f6f",
  brightRed: "#be524b",
  brightGreen: "#4f9768",
  brightYellow: "#cb7b37",
  brightBlue: "#447acb",
  brightMagenta: "#d6b6f6",
  brightCyan: "#4f9d99",
  brightWhite: "#ffffff",
};

export function useTerminalTheme() {
  const preferredDark = usePreferredDark();
  const rootThemeClass = ref(rootThemeClassName());

  function updateRootThemeClass() {
    rootThemeClass.value = rootThemeClassName();
  }

  onMounted(updateRootThemeClass);
  useMutationObserver(rootElement, updateRootThemeClass, { attributeFilter: ["class"] });

  const isDark = computed(() => {
    if (rootThemeClass.value === "dark") {
      return true;
    }
    if (rootThemeClass.value === "light") {
      return false;
    }
    return preferredDark.value;
  });

  const terminalTheme = computed(() => (isDark.value ? darkTerminalTheme : lightTerminalTheme));

  return {
    isDark,
    terminalTheme,
  };
}

function rootThemeClassName() {
  const root = rootElement();
  if (!root) {
    return "";
  }
  const rootClassList = root.classList;
  if (rootClassList.contains("dark")) {
    return "dark";
  }
  if (rootClassList.contains("light")) {
    return "light";
  }
  return "";
}

function rootElement() {
  return typeof document === "undefined" ? null : document.documentElement;
}
