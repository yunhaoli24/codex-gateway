import type { FilePreviewTab } from "~~/shared/types";
import { defineStore } from "pinia";
import { markRaw } from "vue";
import { isTextPreviewPath } from "~~/shared/file-preview";
import { useAuthStore } from "@/stores/auth";

type OpenFilePreviewInput = {
  hostId: number;
  projectId?: number | null;
  threadId: string;
  path: string;
  line?: number | null;
};

export const useGatewayFilePreviewStore = defineStore("gateway-file-preview", () => {
  const tabs = ref<FilePreviewTab[]>([]);
  const filesByKey = shallowRef<Record<string, File | null>>({});
  const activeTabKey = ref<string | null>(null);

  function visibleTabsFor(hostId: number | null, threadId: string | null) {
    if (!hostId || !threadId) {
      return [];
    }
    return tabs.value.filter((tab) => tab.hostId === hostId && tab.threadId === threadId);
  }

  async function openFilePreview(input: OpenFilePreviewInput) {
    const key = tabKey(input.hostId, input.threadId, input.path);
    const existing = tabs.value.find((tab) => tab.key === key);
    if (existing) {
      existing.line = input.line ?? existing.line;
      existing.updatedAt = Date.now();
      activeTabKey.value = key;
      if (!existing.objectUrl && !existing.loading) {
        await loadTab(existing);
      }
      return;
    }

    const tab = reactive<FilePreviewTab>({
      key,
      hostId: input.hostId,
      projectId: input.projectId ?? null,
      threadId: input.threadId,
      path: input.path,
      title: fileName(input.path),
      line: input.line ?? null,
      contentType: "",
      size: null,
      objectUrl: "",
      text: "",
      loading: false,
      error: null,
      updatedAt: Date.now(),
    });
    tabs.value = [...tabs.value, tab];
    activeTabKey.value = key;
    await loadTab(tab);
  }

  function activateTab(key: string) {
    if (tabs.value.some((tab) => tab.key === key)) {
      activeTabKey.value = key;
    }
  }

  function closeTab(key: string) {
    const closingIndex = tabs.value.findIndex((tab) => tab.key === key);
    if (closingIndex < 0) {
      return;
    }
    revokeTab(tabs.value[closingIndex]);
    const nextTabs = tabs.value.filter((tab) => tab.key !== key);
    tabs.value = nextTabs;
    const nextFiles = { ...filesByKey.value };
    delete nextFiles[key];
    filesByKey.value = nextFiles;
    if (activeTabKey.value === key) {
      activeTabKey.value = nextTabs[Math.min(closingIndex, nextTabs.length - 1)]?.key ?? null;
    }
  }

  async function loadTab(tab: FilePreviewTab) {
    tab.loading = true;
    tab.error = null;
    revokeTab(tab);
    try {
      const response = await fetch(remoteFileUrl(tab.hostId, tab.path), {
        headers: authorizationHeaders(),
      });
      if (!response.ok) {
        throw new Error(await responseErrorMessage(response));
      }
      const blob = await response.blob();
      const contentType = response.headers.get("content-type") || blob.type || "";
      const file = markRaw(new File([blob], tab.title, { type: contentType }));
      const objectUrl = URL.createObjectURL(blob);
      tab.contentType = contentType;
      tab.size = blob.size;
      tab.objectUrl = objectUrl;
      tab.text = isTextPreviewPath(tab.path, contentType) ? await blob.text() : "";
      filesByKey.value = { ...filesByKey.value, [tab.key]: file };
    } catch (caught) {
      tab.error = caught instanceof Error ? caught.message : String(caught);
      filesByKey.value = { ...filesByKey.value, [tab.key]: null };
    } finally {
      tab.loading = false;
    }
  }

  function fileForTab(key: string) {
    return filesByKey.value[key] ?? null;
  }

  return {
    tabs,
    activeTabKey,
    visibleTabsFor,
    openFilePreview,
    activateTab,
    closeTab,
    fileForTab,
  };
});

function tabKey(hostId: number, threadId: string, path: string) {
  return `file:${hostId}:${threadId}:${path}`;
}

function fileName(path: string) {
  return path.split("/").filter(Boolean).pop() || path;
}

function remoteFileUrl(hostId: number, path: string) {
  const query = new URLSearchParams({ hostId: String(hostId), path });
  return `/api/remote/files?${query.toString()}`;
}

function authorizationHeaders(): HeadersInit {
  const auth = useAuthStore();
  auth.hydrate();
  return auth.token ? { authorization: `Bearer ${auth.token}` } : {};
}

async function responseErrorMessage(response: Response) {
  const text = await response.text().catch(() => "");
  return text || response.statusText || `HTTP ${response.status}`;
}

function revokeTab(tab: FilePreviewTab | undefined) {
  if (tab?.objectUrl) {
    URL.revokeObjectURL(tab.objectUrl);
    tab.objectUrl = "";
  }
}
