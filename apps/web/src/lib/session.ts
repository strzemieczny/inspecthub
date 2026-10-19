import type { Session, SessionUser } from "./api";

const TOKEN_KEY = "inspect-hub-token";
const USER_KEY = "inspect-hub-user";
const CHANNEL_NAME = "inspect-hub-session";
const LOCAL_EVENT = "inspect-hub-session-changed";
let cachedToken: string | null | undefined;
let cachedUser: string | null | undefined;
let snapshot: SessionUser | null = null;

export function readStoredUser(): SessionUser | null {
  const token = localStorage.getItem(TOKEN_KEY);
  const rawUser = localStorage.getItem(USER_KEY);
  if (token === cachedToken && rawUser === cachedUser) return snapshot;
  cachedToken = token;
  cachedUser = rawUser;
  snapshot = null;
  if (!token || !rawUser) return snapshot;
  try {
    const user = JSON.parse(rawUser) as Partial<SessionUser> | null;
    if (
      user &&
      typeof user.id === "string" &&
      typeof user.name === "string" &&
      typeof user.email === "string" &&
      (user.role === "ADMIN" || user.role === "OPERATOR")
    )
      snapshot = user as SessionUser;
  } catch {
    // Invalid/incomplete storage is an anonymous session.
  }
  return snapshot;
}

function broadcastSessionChange() {
  window.dispatchEvent(new Event(LOCAL_EVENT));
  if (typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    // Send an invalidation only. Every tab reads the latest shared session,
    // so delayed messages cannot restore an older login after logout.
    channel.postMessage("session-changed");
    channel.close();
  }
}

export function saveSession(session: Session) {
  localStorage.setItem(TOKEN_KEY, session.accessToken);
  localStorage.setItem(USER_KEY, JSON.stringify(session.user));
  broadcastSessionChange();
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  broadcastSessionChange();
}

export function subscribeToSession(onChange: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (
      event.storageArea === localStorage &&
      (event.key === null || event.key === TOKEN_KEY || event.key === USER_KEY)
    )
      onChange();
  };
  const channel =
    typeof BroadcastChannel !== "undefined"
      ? new BroadcastChannel(CHANNEL_NAME)
      : null;
  if (channel) channel.onmessage = onChange;
  window.addEventListener(LOCAL_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  // A suspended tab may have missed messages while in the back/forward cache.
  window.addEventListener("pageshow", onChange);
  return () => {
    channel?.close();
    window.removeEventListener(LOCAL_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("pageshow", onChange);
  };
}
