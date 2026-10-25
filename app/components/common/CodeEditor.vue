<script setup lang="ts">
import { basicSetup } from "codemirror";
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import { Compartment, EditorState, Transaction } from "@codemirror/state";
import type { Extension, StateCommand } from "@codemirror/state";
import { EditorView, keymap, placeholder as placeholderExtension } from "@codemirror/view";
import { useEventListener } from "@vueuse/core";
import { cn } from "@codex-gateway/ui/utils";
import { synchronizeEditorDocument } from "@/utils/editor/synchronize-document";
import {
  gatewayCodeEditorTheme,
  languageExtension,
  type CodeEditorLanguage,
} from "@/utils/code-editor-extensions";

const props = withDefaults(
  defineProps<{
    class?: string;
    language?: CodeEditorLanguage;
    placeholder?: string;
    readOnly?: boolean;
    testId?: string;
    extensions?: Extension[];
    lineWrapping?: boolean;
    revealLine?: number | null;
    initialScrollPosition?: { left: number; top: number };
  }>(),
  {
    language: "text",
    placeholder: "",
    testId: "code-editor",
    extensions: () => [],
    lineWrapping: true,
    revealLine: null,
    initialScrollPosition: () => ({ left: 0, top: 0 }),
  },
);

const emit = defineEmits<{
  blur: [];
  save: [];
  scrollPosition: [position: { left: number; top: number }];
}>();

const model = defineModel<string>({ default: "" });
const containerRef = ref<HTMLElement | null>(null);
const editorView = shallowRef<EditorView | null>(null);
const languageCompartment = new Compartment();
const editableCompartment = new Compartment();
const placeholderCompartment = new Compartment();
const customExtensionsCompartment = new Compartment();
const editorClass = computed(() =>
  cn("min-h-0 flex-1 overflow-hidden rounded-md border border-input bg-surface", props.class),
);

onMounted(() => {
  if (!containerRef.value) {
    return;
  }
  editorView.value = new EditorView({
    parent: containerRef.value,
    state: EditorState.create({
      doc: model.value,
      extensions: editorExtensions(),
    }),
  });
  editorView.value.scrollDOM.scrollTo({
    left: props.initialScrollPosition.left,
    top: props.initialScrollPosition.top,
  });
  if (!props.initialScrollPosition.left && !props.initialScrollPosition.top) {
    revealRequestedLine();
  }
});

useEventListener(
  computed(() => editorView.value?.scrollDOM ?? null),
  "scroll",
  (event) => {
    const element = event.currentTarget as HTMLElement;
    emit("scrollPosition", { left: element.scrollLeft, top: element.scrollTop });
  },
  { passive: true },
);

onBeforeUnmount(() => {
  editorView.value?.destroy();
  editorView.value = null;
});

watch(model, (value) => {
  const view = editorView.value;
  if (view) synchronizeEditorDocument(view, value);
});

watch(
  () => props.language,
  (language) => {
    editorView.value?.dispatch({
      effects: languageCompartment.reconfigure(languageExtension(language)),
    });
  },
);

watch(() => props.revealLine, revealRequestedLine);

function revealRequestedLine() {
  const view = editorView.value;
  const lineNumber = props.revealLine;
  if (!view || !lineNumber || lineNumber < 1) return;
  const line = view.state.doc.line(Math.min(lineNumber, view.state.doc.lines));
  view.dispatch({
    selection: { anchor: line.from },
    effects: EditorView.scrollIntoView(line.from, { y: "center" }),
  });
}

watch(
  () => props.readOnly,
  (readOnly) => {
    editorView.value?.dispatch({
      effects: editableCompartment.reconfigure(EditorView.editable.of(!readOnly)),
    });
  },
);

watch(
  () => props.placeholder,
  (placeholder) => {
    editorView.value?.dispatch({
      effects: placeholderCompartment.reconfigure(
        placeholder ? placeholderExtension(placeholder) : [],
      ),
    });
  },
);

watch(
  () => props.extensions,
  (extensions) => {
    editorView.value?.dispatch({
      effects: customExtensionsCompartment.reconfigure(extensions),
    });
  },
);

function runCommand(command: StateCommand) {
  const view = editorView.value;
  return view === null ? false : command(view);
}

defineExpose({ runCommand });

function editorExtensions(): Extension[] {
  return [
    basicSetup,
    gatewayCodeEditorTheme,
    languageCompartment.of(languageExtension(props.language)),
    editableCompartment.of(EditorView.editable.of(!props.readOnly)),
    placeholderCompartment.of(props.placeholder ? placeholderExtension(props.placeholder) : []),
    ...(props.lineWrapping ? [EditorView.lineWrapping] : []),
    customExtensionsCompartment.of(props.extensions),
    keymap.of([
      {
        key: "Mod-s",
        preventDefault: true,
        run: () => {
          emit("save");
          return true;
        },
      },
    ]),
    EditorView.domEventHandlers({ blur: () => emit("blur") }),
    EditorView.updateListener.of((update) => {
      if (
        !update.docChanged ||
        update.transactions.every(
          (transaction) => transaction.annotation(Transaction.remote) === true,
        )
      ) {
        return;
      }
      model.value = update.state.doc.toString();
    }),
  ];
}
</script>

<template>
  <div ref="containerRef" :data-testid="testId" :class="editorClass" />
</template>
