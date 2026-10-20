export const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000;

// Use wall-clock time so suspension in the background counts as inactivity.
export function monitorInactivity({
  lastActiveAt,
  onExpire,
  onActivity,
  now = Date.now,
  schedule = setTimeout,
  cancel = clearTimeout,
}: {
  lastActiveAt: number;
  onExpire: () => void;
  onActivity: (timestamp: number) => void;
  now?: () => number;
  schedule?: typeof setTimeout;
  cancel?: typeof clearTimeout;
}) {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function check() {
    if (stopped) return false;
    if (timer !== undefined) cancel(timer);
    const remaining = lastActiveAt + INACTIVITY_TIMEOUT_MS - now();
    if (remaining < 0) {
      stopped = true;
      onExpire();
      return false;
    }
    timer = schedule(check, remaining + 1);
    return true;
  }

  check();
  return {
    check,
    activity() {
      // An interaction after the deadline must not revive an expired session.
      if (!check()) return false;
      lastActiveAt = now();
      onActivity(lastActiveAt);
      check();
      return true;
    },
    stop() {
      stopped = true;
      if (timer !== undefined) cancel(timer);
    },
  };
}
