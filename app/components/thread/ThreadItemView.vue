<script setup lang="ts">
import UserMessageItem from '@/components/thread/items/UserMessageItem.vue'
import AgentMessageItem from '@/components/thread/items/AgentMessageItem.vue'
import PlanItem from '@/components/thread/items/PlanItem.vue'
import TurnPlanItem from '@/components/thread/items/TurnPlanItem.vue'
import ReasoningItem from '@/components/thread/items/ReasoningItem.vue'
import CommandExecutionItem from '@/components/thread/items/CommandExecutionItem.vue'
import FileChangeItem from '@/components/thread/items/FileChangeItem.vue'
import ToolCallItem from '@/components/thread/items/ToolCallItem.vue'
import HookPromptItem from '@/components/thread/items/HookPromptItem.vue'
import SubAgentActivityItem from '@/components/thread/items/SubAgentActivityItem.vue'
import CollabAgentToolCallItem from '@/components/thread/items/CollabAgentToolCallItem.vue'

defineProps<{
  item: Record<string, any>
  hostId: number | null
  userMessageVariant?: 'normal' | 'steer'
}>()

const toolLikeTypes = new Set([
  'mcpToolCall',
  'dynamicToolCall',
  'webSearch',
  'sleep',
  'imageView',
  'imageGeneration',
  'enteredReviewMode',
  'exitedReviewMode',
  'contextCompaction',
])
</script>

<template>
  <UserMessageItem
    v-if="item.type === 'userMessage'"
    :item="item"
    :host-id="hostId"
    :variant="userMessageVariant"
  />
  <AgentMessageItem v-else-if="item.type === 'agentMessage'" :item="item" />
  <HookPromptItem v-else-if="item.type === 'hookPrompt'" :item="item" />
  <PlanItem v-else-if="item.type === 'plan'" :item="item" />
  <TurnPlanItem v-else-if="item.type === 'turnPlan'" :item="item" />
  <ReasoningItem v-else-if="item.type === 'reasoning'" :item="item" />
  <CommandExecutionItem v-else-if="item.type === 'commandExecution'" :item="item" />
  <FileChangeItem v-else-if="item.type === 'fileChange'" :item="item" />
  <SubAgentActivityItem v-else-if="item.type === 'subAgentActivity'" :item="item" />
  <CollabAgentToolCallItem v-else-if="item.type === 'collabAgentToolCall'" :item="item" />
  <ToolCallItem v-else-if="toolLikeTypes.has(item.type)" :item="item" />
</template>
