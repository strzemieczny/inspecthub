import { subscribeToUpdateGuard, updatesBlocked } from "./update-guard";

declare const __APP_VERSION__: string;

const listeners = new Set<() => void>();
let available = false;
let started = false;

export const updateAvailable = () => available;
export function subscribeToAppUpdates(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function startAppUpdates(): void {
  if (!import.meta.env.PROD || started) return;
  started = true;
  const base = import.meta.env.BASE_URL;
  let registration: ServiceWorkerRegistration | undefined;
  let checking = false;
  let lastCheck = 0;
  let reloadTimer: number | undefined;
  let controllerChanged = false;
  let activating = false;
  let reloading = false;
  const readyAfter = Date.now() + 3000;
  const safe = () =>
    !updatesBlocked() && navigator.onLine && Date.now() >= readyAfter;

  function scheduleUpdate() {
    window.clearTimeout(reloadTimer);
    if (
      !available ||
      !safe() ||
      document.visibilityState !== "visible" ||
      reloading
    )
      return;
    reloadTimer = window.setTimeout(() => {
      if (!safe() || document.visibilityState !== "visible") return;
      if (registration?.installing) return;
      if (registration?.waiting) {
        if (!activating) {
          activating = true;
          registration.waiting.postMessage({ type: "ACTIVATE_UPDATE" });
          // Another tab may still be editing. Retry after it becomes safe.
          window.setTimeout(() => {
            activating = false;
            scheduleUpdate();
          }, 5000);
        }
        return;
      }
      if (navigator.serviceWorker?.controller && !controllerChanged) return;
      reloading = true;
      window.location.reload();
    }, 1000);
  }

  async function check() {
    if (checking || !navigator.onLine || document.visibilityState !== "visible")
      return;
    if (Date.now() - lastCheck < 15_000) {
      scheduleUpdate();
      return;
    }
    checking = true;
    lastCheck = Date.now();
    try {
      // The query also bypasses entries created by the previous cache-first worker.
      const response = await fetch(`${base}version.json?check=${Date.now()}`, {
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      });
      if (response.ok) {
        const data: unknown = await response.json();
        if (
          data &&
          typeof data === "object" &&
          "version" in data &&
          typeof data.version === "string" &&
          data.version.length > 0
        ) {
          const changed = data.version !== __APP_VERSION__;
          if (available !== changed) {
            available = changed;
            listeners.forEach((listener) => listener());
          }
        }
      }
      await registration?.update();
    } catch {
      // Offline, a failed rollout or a proxy error must not interrupt work.
    } finally {
      checking = false;
      scheduleUpdate();
    }
  }

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener(
      "message",
      (event: MessageEvent) => {
        if (event.data?.type === "UPDATE_SAFETY_CHECK") {
          event.ports[0]?.postMessage({ safe: safe() });
        }
      },
    );
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      controllerChanged = true;
      scheduleUpdate();
    });
    void navigator.serviceWorker
      .register(`${base}sw.js`, {
        scope: base,
        updateViaCache: "none",
      })
      .then((value) => {
        registration = value;
        registration.addEventListener("updatefound", () => {
          registration?.installing?.addEventListener(
            "statechange",
            scheduleUpdate,
          );
        });
        scheduleUpdate();
      })
      .catch(() => {
        // No worker on this browser: the version check can still refresh the page.
      });
  }
  subscribeToUpdateGuard(scheduleUpdate);
  window.addEventListener("online", () => {
    lastCheck = 0;
    void check();
  });
  document.addEventListener("visibilitychange", () => {
    void check();
  });
  window.addEventListener("vite:preloadError", () => {
    // Verify a deployment change before reloading; network errors are not updates.
    lastCheck = 0;
    void check();
  });
  window.setInterval(() => {
    void check();
  }, 60_000);
  window.setTimeout(() => {
    void check();
  }, 3000);
}
