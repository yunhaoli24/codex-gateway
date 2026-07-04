<script setup lang="ts">
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { useResizeObserver } from "@vueuse/core";
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { Button } from "@/components/ui/button";
import { useGatewayTerminalTransport } from "@/composables/useGatewayTerminalTransport";
import type { TerminalSessionState } from "@/stores/gateway/types";
import "@xterm/xterm/css/xterm.css";

const props = defineProps<{
  session: TerminalSessionState;
  active: boolean;
}>();

const terminalTransport = useGatewayTerminalTransport();
const { t } = useI18n();
const terminalTheme = {
  background: "#111111",
  foreground: "#f4f1ea",
  cursor: "#f4f1ea",
  selectionBackground: "#5f5a4d",
} as const;
const terminalRoot = ref<HTMLElement | null>(null);
let terminal: Terminal | null = null;
let fitAddon: FitAddon | null = null;
let writtenLength = 0;

useResizeObserver(terminalRoot, () => fitAndReport());

onMounted(() => {
  if (!terminalRoot.value) {
    return;
  }
  terminal = new Terminal({
    cursorBlink: true,
    convertEol: true,
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    fontSize: 13,
    theme: terminalTheme,
  });
  fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);
  terminal.open(terminalRoot.value);
  terminal.onData((data) => {
    if (props.session.status === "open") {
      terminalTransport.sendTerminalInput(props.session.sessionId, data);
    }
  });
  writeOutput(props.session.output);
  void nextTick(() => fitAndReport());
});

onBeforeUnmount(() => {
  terminal?.dispose();
  terminal = null;
  fitAddon = null;
});

watch(
  () => props.session.output,
  (output) => writeOutput(output),
);

watch(
  () => props.active,
  (active) => {
    if (active) {
      void nextTick(() => {
        fitAndReport();
        terminal?.focus();
      });
    }
  },
);

function writeOutput(output: string) {
  if (!terminal) {
    return;
  }
  if (output.length < writtenLength) {
    terminal.clear();
    writtenLength = 0;
  }
  const delta = output.slice(writtenLength);
  if (delta) {
    terminal.write(delta);
    writtenLength = output.length;
  }
}

function fitAndReport() {
  if (!terminal || !fitAddon || !terminalRoot.value || !props.active) {
    return;
  }
  fitAddon.fit();
  const cols = terminal.cols;
  const rows = terminal.rows;
  if (cols && rows && (cols !== props.session.cols || rows !== props.session.rows)) {
    terminalTransport.resizeTerminal(props.session.sessionId, cols, rows);
  }
}
</script>

<template>
  <div data-testid="terminal-panel" class="flex min-h-0 flex-1 flex-col bg-ink">
    <div
      class="flex min-h-10 items-center justify-between border-b border-white/10 px-3 text-xs text-white/80"
    >
      <div class="min-w-0 truncate">
        <span class="font-medium">{{ session.title }}</span>
        <span v-if="session.cwd" class="ml-2 text-white/55">{{ session.cwd }}</span>
      </div>
      <Button
        v-if="session.status === 'closed'"
        variant="ghost"
        size="sm"
        class="h-7 text-white/80 hover:bg-white/10 hover:text-white"
        @click="terminalTransport.closeTerminal(session.sessionId)"
      >
        {{ t("app.close") }}
      </Button>
    </div>
    <div
      ref="terminalRoot"
      data-testid="terminal-root"
      class="min-h-0 flex-1 overflow-hidden p-2"
    />
  </div>
</template>
