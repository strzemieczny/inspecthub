// Shared by the update controller, React views and requests (including offline sync).
const blockers = new Set<symbol>();
const listeners = new Set<() => void>();

export function updatesBlocked(): boolean {
  return blockers.size > 0;
}

export function subscribeToUpdateGuard(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function blockUpdates(): () => void {
  const key = Symbol();
  blockers.add(key);
  listeners.forEach((listener) => listener());
  return () => {
    if (blockers.delete(key)) listeners.forEach((listener) => listener());
  };
}
