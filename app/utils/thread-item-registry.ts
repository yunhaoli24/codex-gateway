import type { Component } from "vue";
import UserMessageItem from "@/components/thread/items/UserMessageItem.vue";
import AgentMessageItem from "@/components/thread/items/AgentMessageItem.vue";
import PlanItem from "@/components/thread/items/PlanItem.vue";
import TurnPlanItem from "@/components/thread/items/TurnPlanItem.vue";
import ReasoningItem from "@/components/thread/items/ReasoningItem.vue";
import CommandExecutionItem from "@/components/thread/items/CommandExecutionItem.vue";
import FileChangeItem from "@/components/thread/items/FileChangeItem.vue";
import ToolCallItem from "@/components/thread/items/ToolCallItem.vue";
import ImageViewItem from "@/components/thread/items/ImageViewItem.vue";
import SleepItem from "@/components/thread/items/SleepItem.vue";
import ContextCompactionItem from "@/components/thread/items/ContextCompactionItem.vue";
import ServerRequestItem from "@/components/thread/items/ServerRequestItem.vue";
import RequestUserInputItem from "@/components/thread/items/RequestUserInputItem.vue";
import McpElicitationRequestItem from "@/components/thread/items/McpElicitationRequestItem.vue";
import PermissionsRequestItem from "@/components/thread/items/PermissionsRequestItem.vue";
import DynamicToolClientRequestItem from "@/components/thread/items/DynamicToolClientRequestItem.vue";
import ChatgptAuthTokensRefreshRequestItem from "@/components/thread/items/ChatgptAuthTokensRefreshRequestItem.vue";
import ProtocolMismatchRequestItem from "@/components/thread/items/ProtocolMismatchRequestItem.vue";
import HookPromptItem from "@/components/thread/items/HookPromptItem.vue";
import SubAgentActivityItem from "@/components/thread/items/SubAgentActivityItem.vue";
import CollabAgentToolCallItem from "@/components/thread/items/CollabAgentToolCallItem.vue";

const threadItemComponents = {
  agentMessage: AgentMessageItem,
  attestationRequest: ProtocolMismatchRequestItem,
  chatgptAuthTokensRefreshRequest: ChatgptAuthTokensRefreshRequestItem,
  commandExecution: CommandExecutionItem,
  contextCompaction: ContextCompactionItem,
  collabAgentToolCall: CollabAgentToolCallItem,
  dynamicToolClientRequest: DynamicToolClientRequestItem,
  dynamicToolCall: ToolCallItem,
  enteredReviewMode: ToolCallItem,
  exitedReviewMode: ToolCallItem,
  fileChange: FileChangeItem,
  hookPrompt: HookPromptItem,
  imageGeneration: ToolCallItem,
  imageView: ImageViewItem,
  mcpElicitationRequest: McpElicitationRequestItem,
  mcpToolCall: ToolCallItem,
  permissionsRequest: PermissionsRequestItem,
  plan: PlanItem,
  reasoning: ReasoningItem,
  requestUserInput: RequestUserInputItem,
  serverRequest: ServerRequestItem,
  sleep: SleepItem,
  subAgentActivity: SubAgentActivityItem,
  turnPlan: TurnPlanItem,
  userMessage: UserMessageItem,
  webSearch: ToolCallItem,
} satisfies Record<string, Component>;

export type ThreadItemType = keyof typeof threadItemComponents;

export function componentForThreadItem(type: string): Component | undefined {
  return threadItemComponents[type as ThreadItemType];
}
