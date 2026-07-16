import { tmuxMonitorPollCoordinator } from "../../utils/gateway/tmux-monitor/poll-coordinator";

export default defineTask({
  meta: {
    name: "gateway:poll-tmux-monitors",
    description: "Poll active remote tmux pane monitors and publish completion notifications.",
  },
  async run() {
    return { result: await tmuxMonitorPollCoordinator.run() };
  },
});
