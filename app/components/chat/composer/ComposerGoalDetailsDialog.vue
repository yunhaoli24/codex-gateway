<script setup lang="ts">
import type { ThreadGoal } from "~~/shared/types";
import MarkdownContent from "@/components/common/MarkdownContent.vue";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

defineProps<{
  goal: ThreadGoal;
  elapsedLabel: string;
  tokensLabel: string;
  budgetLabel: string;
}>();
</script>

<template>
  <Dialog>
    <DialogTrigger as-child>
      <button
        type="button"
        data-testid="composer-goal-summary"
        class="flex w-full min-w-0 items-center gap-3 rounded-2xl border border-primary/20 bg-primary/5 px-3 py-2 text-left text-sm text-ink shadow-sm shadow-ink/5 transition hover:border-primary/40 hover:bg-primary/10 md:text-base"
      >
        <span class="shrink-0 font-medium text-primary">{{ $t("app.goalModeActive") }}</span>
        <span class="min-w-0 flex-1 truncate text-ink-secondary">{{ goal.objective }}</span>
        <span
          class="flex shrink-0 flex-col items-end gap-0.5 font-mono text-xs text-ink-muted sm:flex-row sm:items-center sm:gap-2"
        >
          <span>{{ elapsedLabel }}</span>
          <span>{{ tokensLabel }}</span>
        </span>
      </button>
    </DialogTrigger>

    <DialogContent
      class="flex h-[min(54rem,calc(100dvh-3rem))] w-[min(70rem,calc(100vw-3rem))] !max-w-[min(70rem,calc(100vw-3rem))] flex-col overflow-hidden p-0"
    >
      <DialogHeader class="shrink-0 border-b border-hairline px-6 py-5">
        <DialogTitle class="text-lg">{{ $t("app.goalDetailsTitle") }}</DialogTitle>
        <DialogDescription>{{ $t("app.goalDetailsDescription") }}</DialogDescription>
      </DialogHeader>

      <div class="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-6 py-5">
        <div
          class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-hairline bg-canvas-soft"
        >
          <div
            class="shrink-0 border-b border-hairline px-4 py-3 text-xs font-medium uppercase tracking-wide text-ink-muted"
          >
            {{ $t("app.goalObjective") }}
          </div>
          <ScrollArea class="min-h-0 flex-1">
            <div class="p-4 pr-6">
              <MarkdownContent :content="goal.objective" compact />
            </div>
          </ScrollArea>
        </div>

        <dl class="grid shrink-0 grid-cols-1 gap-3 sm:grid-cols-3">
          <div class="rounded-2xl border border-hairline bg-surface p-3">
            <dt class="text-xs text-ink-muted">{{ $t("app.goalElapsed") }}</dt>
            <dd class="mt-1 font-mono text-sm text-ink">{{ elapsedLabel }}</dd>
          </div>
          <div class="rounded-2xl border border-hairline bg-surface p-3">
            <dt class="text-xs text-ink-muted">{{ $t("app.goalTokensUsed") }}</dt>
            <dd class="mt-1 font-mono text-sm text-ink">{{ tokensLabel }}</dd>
          </div>
          <div class="rounded-2xl border border-hairline bg-surface p-3">
            <dt class="text-xs text-ink-muted">{{ $t("app.goalTokenBudget") }}</dt>
            <dd class="mt-1 font-mono text-sm text-ink">{{ budgetLabel }}</dd>
          </div>
        </dl>
      </div>
    </DialogContent>
  </Dialog>
</template>
