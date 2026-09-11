import type { RealtimeClientMessage } from "~~/shared/types";
import { requireRecord } from "../../http/validation/common";
import { threadBroker } from "../../runtime/broker";
import { hostStore } from "../../state/hosts";
import { projectStore } from "../../state/projects";
import { sendRealtimePeerMessage, type RealtimePeer } from "../peer-state";

export async function readProjectDefaults(
  peer: RealtimePeer,
  request: Extract<RealtimeClientMessage, { type: "project.defaults.read" }>,
) {
  const host = requireRecord(hostStore.getWithSecret(request.hostId), "Host not found");
  const project = requireRecord(projectStore.get(request.projectId), "Project not found");
  if (project.hostId !== host.id) {
    throw new Error(`Project ${project.id} does not belong to host ${host.id}`);
  }
  const defaults = await threadBroker.readProjectDefaults(
    host,
    project.remotePath,
    request.provider,
  );
  sendRealtimePeerMessage(peer, {
    type: "project.defaults.snapshot",
    requestId: request.requestId,
    hostId: host.id,
    projectId: project.id,
    defaults,
  });
}
