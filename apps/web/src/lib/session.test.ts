/// <reference types="node" />
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  clearSession,
  readStoredUser,
  saveSession,
  subscribeToSession,
} from "./session.ts";

const data = new Map<string, string>();
const storage = {
  getItem: (key: string) => data.get(key) ?? null,
  setItem: (key: string, value: string) => data.set(key, value),
  removeItem: (key: string) => data.delete(key),
};
const browser = new EventTarget();
Object.defineProperty(globalThis, "window", {
  value: browser,
  configurable: true,
});
Object.defineProperty(globalThis, "localStorage", {
  value: storage,
  configurable: true,
});
const session = {
  accessToken: "token-a",
  user: {
    id: "alice",
    name: "Alice",
    email: "alice@example.com",
    role: "ADMIN" as const,
  },
};

afterEach(() => data.clear());

test("local login/logout notify subscribers and keep a stable React snapshot", () => {
  let changes = 0;
  const unsubscribe = subscribeToSession(() => changes++);
  try {
    saveSession(session);
    assert.deepEqual(readStoredUser(), session.user);
    assert.equal(readStoredUser(), readStoredUser());
    clearSession();
    assert.equal(readStoredUser(), null);
    assert.equal(changes, 2);
  } finally {
    unsubscribe();
  }
});

test("a broadcast from another tab reads the latest storage, never an old session payload", async () => {
  saveSession(session);
  const sender = new BroadcastChannel("inspect-hub-session");
  let unsubscribe = () => {};
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Missing session broadcast")),
        1000,
      );
      unsubscribe = subscribeToSession(() => {
        try {
          assert.equal(readStoredUser(), null);
          clearTimeout(timer);
          resolve();
        } catch (error) {
          clearTimeout(timer);
          reject(error);
        }
      });
      storage.removeItem("inspect-hub-token");
      storage.removeItem("inspect-hub-user");
      sender.postMessage({ staleSession: session });
    });
  } finally {
    unsubscribe();
    sender.close();
  }
});

test("storage events synchronize account changes and storage.clear without BroadcastChannel", () => {
  const original = globalThis.BroadcastChannel;
  Object.defineProperty(globalThis, "BroadcastChannel", {
    value: undefined,
    configurable: true,
    writable: true,
  });
  let changes = 0;
  const unsubscribe = subscribeToSession(() => changes++);
  const changed = (key: string | null) =>
    browser.dispatchEvent(
      Object.assign(new Event("storage"), { key, storageArea: storage }),
    );
  try {
    saveSession(session);
    const bob = { ...session.user, id: "bob", name: "Bob", role: "OPERATOR" };
    storage.setItem("inspect-hub-token", "token-b");
    storage.setItem("inspect-hub-user", JSON.stringify(bob));
    changed("inspect-hub-user");
    assert.deepEqual(readStoredUser(), bob);
    changed("inspect-hub-theme");
    assert.equal(changes, 2);
    data.clear();
    changed(null);
    assert.equal(readStoredUser(), null);
    assert.equal(changes, 3);
    unsubscribe();
    changed("inspect-hub-token");
    assert.equal(changes, 3);
  } finally {
    unsubscribe();
    Object.defineProperty(globalThis, "BroadcastChannel", {
      value: original,
      configurable: true,
      writable: true,
    });
  }
});

test("incomplete or corrupt shared storage is treated as logged out", () => {
  saveSession(session);
  storage.setItem("inspect-hub-user", "not-json");
  assert.equal(readStoredUser(), null);
  storage.setItem("inspect-hub-user", "null");
  assert.equal(readStoredUser(), null);
  storage.setItem("inspect-hub-user", JSON.stringify(session.user));
  storage.removeItem("inspect-hub-token");
  assert.equal(readStoredUser(), null);
});
