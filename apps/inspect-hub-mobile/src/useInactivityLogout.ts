import { useEffect, useEffectEvent, useRef } from "react";
import { AppState } from "react-native";
import type { Session } from "./inspection";
import { monitorInactivity } from "./inactivity";
import { storage } from "./storage";

export function useInactivityLogout(
  session: (Session & { lastActiveAt?: number }) | null,
  onExpire: () => void,
) {
  const monitor = useRef<ReturnType<typeof monitorInactivity> | null>(null);
  const expire = useEffectEvent(onExpire);

  useEffect(() => {
    if (!session) return;
    let lastActivity = session.lastActiveAt ?? Date.now();
    let lastSavedActivity = lastActivity;
    const current = monitorInactivity({
      lastActiveAt: lastActivity,
      onExpire: expire,
      onActivity: (timestamp) => {
        lastActivity = timestamp;
        // Touch-move events can arrive every frame; limit storage writes.
        if (timestamp - lastSavedActivity >= 1000) {
          lastSavedActivity = timestamp;
          void storage.saveLastActivity(timestamp).catch(() => {});
        }
      },
    });
    monitor.current = current;
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active") current.check();
      else void storage.saveLastActivity(lastActivity).catch(() => {});
    });
    return () => {
      listener.remove();
      current.stop();
      monitor.current = null;
    };
  }, [session]);

  return function recordActivity() {
    return monitor.current?.activity() ?? true;
  };
}
