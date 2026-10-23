import { useAuthStore } from "@/stores/auth";
import { loadAuthorizedImage } from "@/utils/browser-runtime/authorized-image-cache";

export function useAuthorizedObjectUrl(source: Ref<string> | ComputedRef<string>) {
  const auth = useAuthStore();
  auth.hydrate();
  const objectUrl = ref("");
  const loading = ref(false);
  const error = ref<Error | null>(null);
  let activeUrl = "";

  function revokeActiveUrl() {
    if (activeUrl) {
      URL.revokeObjectURL(activeUrl);
      activeUrl = "";
    }
  }

  watch(
    [source, () => auth.sessionEpoch] as const,
    async ([nextSource, sessionEpoch], _previous, onCleanup) => {
      let active = true;
      // Vue also runs watch cleanup on scope disposal. Invalidate before creating a URL,
      // while leaving the shared Blob cache/download available to other mounted images.
      onCleanup(() => {
        active = false;
        revokeActiveUrl();
      });
      revokeActiveUrl();
      objectUrl.value = "";
      error.value = null;
      loading.value = false;

      if (!nextSource) {
        return;
      }
      if (isPublicImageSource(nextSource)) {
        objectUrl.value = nextSource;
        return;
      }

      loading.value = true;
      try {
        const blob = await loadAuthorizedImage({
          source: nextSource,
          token: auth.token,
          sessionEpoch,
        });
        if (!active || !auth.isCurrentSession(sessionEpoch)) return;
        const url = URL.createObjectURL(blob);
        activeUrl = url;
        objectUrl.value = url;
      } catch (caught) {
        if (active) {
          error.value = caught instanceof Error ? caught : new Error(String(caught));
        }
      } finally {
        if (active) {
          loading.value = false;
        }
      }
    },
    { immediate: true },
  );

  return {
    objectUrl,
    loading,
    error,
  };
}

function isPublicImageSource(source: string) {
  return /^blob:|^data:|^https?:\/\//i.test(source) && !source.startsWith("/api/");
}
