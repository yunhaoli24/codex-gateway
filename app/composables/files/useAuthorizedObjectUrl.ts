import { useAuthStore } from "@/stores/auth";

export function useAuthorizedObjectUrl(source: Ref<string> | ComputedRef<string>) {
  const objectUrl = ref("");
  const loading = ref(false);
  const error = ref<Error | null>(null);
  let activeUrl = "";
  let requestId = 0;

  function revokeActiveUrl() {
    if (activeUrl) {
      URL.revokeObjectURL(activeUrl);
      activeUrl = "";
    }
  }

  watch(
    source,
    async (nextSource) => {
      const currentRequest = ++requestId;
      revokeActiveUrl();
      objectUrl.value = "";
      error.value = null;

      if (!nextSource) {
        return;
      }
      if (isPublicImageSource(nextSource)) {
        objectUrl.value = nextSource;
        return;
      }

      loading.value = true;
      try {
        const auth = useAuthStore();
        auth.hydrate();
        const response = await fetch(nextSource, {
          headers: auth.token ? { authorization: `Bearer ${auth.token}` } : {},
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const blob = await response.blob();
        if (!blob.type.startsWith("image/")) {
          throw new Error("Response is not an image");
        }
        const url = URL.createObjectURL(blob);
        if (currentRequest !== requestId) {
          URL.revokeObjectURL(url);
          return;
        }
        activeUrl = url;
        objectUrl.value = url;
      } catch (caught) {
        if (currentRequest === requestId) {
          error.value = caught instanceof Error ? caught : new Error(String(caught));
        }
      } finally {
        if (currentRequest === requestId) {
          loading.value = false;
        }
      }
    },
    { immediate: true },
  );

  onBeforeUnmount(revokeActiveUrl);

  return {
    objectUrl,
    loading,
    error,
  };
}

function isPublicImageSource(source: string) {
  return /^blob:|^data:|^https?:\/\//i.test(source) && !source.startsWith("/api/");
}
