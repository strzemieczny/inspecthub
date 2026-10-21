import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { test } from "node:test";
import vm from "node:vm";

class Events {
  listeners = new Map();
  addEventListener(name, listener) {
    const items = this.listeners.get(name) ?? [];
    items.push(listener);
    this.listeners.set(name, items);
  }
  dispatch(name, event = {}) {
    for (const listener of this.listeners.get(name) ?? []) listener(event);
  }
}

async function browser({
  worker = true,
  version = "new",
  blocked = false,
} = {}) {
  let now = 1_700_000_000_000;
  let id = 0;
  const timers = new Map();
  const setTimer = (fn, delay, repeat = false) => {
    const key = ++id;
    timers.set(key, { fn, due: now + delay, repeat: repeat && delay });
    return key;
  };
  const flush = () => new Promise((resolve) => setImmediate(resolve));
  const state = {
    reloads: 0,
    activations: 0,
    updates: 0,
    fetches: [],
    version,
  };
  const document = Object.assign(new Events(), { visibilityState: "visible" });
  const serviceWorker = Object.assign(new Events(), {
    controller: {},
    register: async (url, options) => {
      state.registration = { url, options };
      return registration;
    },
  });
  const registration = Object.assign(new Events(), {
    installing: null,
    waiting: worker ? { postMessage: () => state.activations++ } : null,
    update: async () => {
      state.updates++;
    },
  });
  const navigator = { onLine: true, ...(worker ? { serviceWorker } : {}) };
  const window = Object.assign(new Events(), {
    location: { reload: () => state.reloads++ },
    setTimeout: (fn, delay) => setTimer(fn, delay),
    clearTimeout: (key) => timers.delete(key),
    setInterval: (fn, delay) => setTimer(fn, delay, true),
  });
  const context = vm.createContext({
    window,
    document,
    navigator,
    AbortSignal,
    Date: class extends Date {
      static now() {
        return now;
      }
    },
    __APP_VERSION__: "current",
    fetch: async (url, options) => {
      state.fetches.push({ url, options });
      if (state.fail) throw new TypeError("offline");
      return { ok: true, json: async () => ({ version: state.version }) };
    },
  });
  const modules = new Map();
  const load = (name) => {
    if (!modules.has(name)) {
      modules.set(
        name,
        new vm.SourceTextModule(
          stripTypeScriptTypes(
            readFileSync(
              new URL(`../src/lib/${name}.ts`, import.meta.url),
              "utf8",
            ),
          ),
          {
            context,
            initializeImportMeta: (meta) => {
              meta.env = { PROD: true, BASE_URL: "/inspect-hub/" };
            },
          },
        ),
      );
    }
    return modules.get(name);
  };
  const app = load("app-updates");
  await app.link(() => load("update-guard"));
  await app.evaluate();
  const guard = load("update-guard").namespace;
  const release = blocked ? guard.blockUpdates() : () => {};
  app.namespace.startAppUpdates();
  await flush();
  async function advance(ms) {
    const end = now + ms;
    while (true) {
      const next = [...timers.entries()]
        .filter(([, value]) => value.due <= end)
        .sort((a, b) => a[1].due - b[1].due)[0];
      if (!next) break;
      now = next[1].due;
      timers.delete(next[0]);
      if (next[1].repeat)
        timers.set(next[0], { ...next[1], due: now + next[1].repeat });
      next[1].fn();
      await flush();
    }
    now = end;
    await flush();
  }
  return {
    window,
    state,
    document,
    navigator,
    serviceWorker,
    registration,
    release,
    guard,
    updates: app.namespace,
    advance,
    flush,
  };
}

test("unchanged release does not reload and checks worker without HTTP cache", async () => {
  const b = await browser({ version: "current" });
  await b.advance(65_000);
  assert.equal(b.state.reloads, 0);
  assert.equal(b.state.activations, 0);
  assert.equal(b.state.updates, 2);
  assert.equal(b.state.registration.options.updateViaCache, "none");
  assert.equal(b.state.fetches[0].options.cache, "no-store");
  assert.match(b.state.fetches[0].url, /^\/inspect-hub\/version.json\?check=/);
});

test("unsaved work delays activation and reload until the new worker controls the tab", async () => {
  const b = await browser({ blocked: true });
  await b.advance(5000);
  assert.equal(b.updates.updateAvailable(), true);
  assert.equal(b.state.activations, 0);
  b.release();
  await b.advance(1000);
  assert.equal(b.state.activations, 1);
  assert.equal(b.state.reloads, 0);
  b.registration.waiting = null;
  b.serviceWorker.dispatch("controllerchange");
  await b.advance(1000);
  assert.equal(b.state.reloads, 1);
  await b.advance(65_000);
  assert.equal(b.state.reloads, 1);
});

test("a request starting during the reload delay cancels the reload", async () => {
  const b = await browser({ worker: false });
  await b.advance(3000);
  const release = b.guard.blockUpdates();
  await b.advance(2000);
  assert.equal(b.state.reloads, 0);
  release();
  await b.advance(1000);
  assert.equal(b.state.reloads, 1);
});

test("overlapping requests release independently and cleanup is idempotent", async () => {
  const b = await browser({ worker: false });
  const first = b.guard.blockUpdates();
  const second = b.guard.blockUpdates();
  first();
  first();
  await b.advance(5000);
  assert.equal(b.state.reloads, 0);
  second();
  await b.advance(1000);
  assert.equal(b.state.reloads, 1);
});

test("hidden and offline tabs do not reload; reconnect resumes checks", async () => {
  const b = await browser({ worker: false });
  b.document.visibilityState = "hidden";
  await b.advance(65_000);
  assert.equal(b.state.fetches.length, 0);
  b.document.visibilityState = "visible";
  b.navigator.onLine = false;
  b.document.dispatch("visibilitychange");
  await b.advance(1000);
  assert.equal(b.state.reloads, 0);
  b.navigator.onLine = true;
  b.window.dispatch("online");
  await b.flush();
  await b.advance(1000);
  assert.equal(b.state.reloads, 1);
});

test("failed version requests and malformed responses do not trigger reloads", async () => {
  const b = await browser({ worker: false, version: null });
  await b.advance(5000);
  assert.equal(b.state.reloads, 0);
  b.state.fail = true;
  await b.advance(60_000);
  assert.equal(b.state.reloads, 0);
});

function workerHarness({ scope = "/inspect-hub/", clients = [] } = {}) {
  const handlers = new Map();
  const state = { activated: 0, deleted: [], writes: [], precached: [] };
  const cache = {
    addAll: async (urls) => {
      state.precached = urls;
    },
    match: async (request) => ({ cached: request }),
    put: async (...args) => {
      state.writes.push(args);
    },
  };
  const self = {
    registration: { scope: `https://example.com${scope}` },
    location: { origin: "https://example.com" },
    addEventListener: (name, fn) => handlers.set(name, fn),
    skipWaiting: async () => {
      state.activated++;
    },
    clients: { matchAll: async () => clients, claim: async () => {} },
  };
  class MessageChannel {
    port1 = { close() {}, onmessage: null };
    port2 = {
      postMessage: (data) =>
        queueMicrotask(() => this.port1.onmessage?.({ data })),
    };
  }
  vm.runInNewContext(
    readFileSync(new URL("../service-worker.js", import.meta.url), "utf8")
      .replaceAll("__APP_VERSION__", "test-build")
      .replace(
        "__PRECACHE_ASSETS__",
        '["assets/app.hash.js","assets/style.hash.css"]',
      ),
    {
      self,
      URL,
      MessageChannel,
      queueMicrotask,
      setTimeout,
      clearTimeout,
      caches: {
        open: async () => cache,
        keys: async () => [
          "inspect-hub:/inspect-hub/:shell:test-build",
          "inspect-hub:/inspect-hub/:shell:old",
          "inspect-hub-shell-v4-/inspect-hub/",
          "inspect-hub:/other/:shell:old",
          "unrelated",
        ],
        delete: async (key) => {
          state.deleted.push(key);
        },
      },
    },
  );
  async function event(name, data = {}) {
    let work;
    handlers.get(name)({
      ...data,
      waitUntil: (value) => {
        work = value;
      },
    });
    await work;
  }
  return { state, handlers, event };
}
const client = (safe) => ({
  url: "https://example.com/inspect-hub/pl/inspection",
  postMessage: (_message, ports) => ports[0].postMessage({ safe }),
});

test("worker installs complete build without activating unconditionally", async () => {
  const w = workerHarness();
  await w.event("install");
  assert.equal(w.state.activated, 0);
  assert.ok(w.state.precached.includes("/inspect-hub/assets/app.hash.js"));
  assert.ok(w.state.precached.includes("/inspect-hub/assets/style.hash.css"));
});

test("one busy tab prevents worker activation across all tabs", async () => {
  const blocked = workerHarness({ clients: [client(true), client(false)] });
  await blocked.event("message", { data: { type: "ACTIVATE_UPDATE" } });
  assert.equal(blocked.state.activated, 0);
  const ready = workerHarness({ clients: [client(true), client(true)] });
  await ready.event("message", { data: { type: "ACTIVATE_UPDATE" } });
  assert.equal(ready.state.activated, 1);
});

test("worker bypasses version, worker scripts and API, including query parameters", () => {
  const w = workerHarness();
  for (const path of ["version.json?check=123", "sw.js", "api/forms"]) {
    let intercepted = false;
    w.handlers.get("fetch")({
      request: {
        method: "GET",
        url: `https://example.com/inspect-hub/${path}`,
      },
      respondWith: () => {
        intercepted = true;
      },
    });
    assert.equal(intercepted, false, path);
  }
});

test("activation cleans only this app scope, preserving caches of other apps", async () => {
  const w = workerHarness();
  await w.event("activate");
  assert.deepEqual(w.state.deleted, [
    "inspect-hub:/inspect-hub/:shell:old",
    "inspect-hub-shell-v4-/inspect-hub/",
  ]);
});

test("rolling back to the running version clears the update notice", async () => {
  const b = await browser({ blocked: true, worker: false });
  await b.advance(5000);
  assert.equal(b.updates.updateAvailable(), true);
  b.state.version = "current";
  await b.advance(60_000);
  assert.equal(b.updates.updateAvailable(), false);
  b.release();
  await b.advance(1000);
  assert.equal(b.state.reloads, 0);
});

test("claiming a worker on the first installation does not reload the current release", async () => {
  const b = await browser({ version: "current" });
  b.registration.waiting = null;
  b.serviceWorker.dispatch("controllerchange");
  await b.advance(5000);
  assert.equal(b.state.reloads, 0);
});

test("worker refuses activation if a legacy or frozen tab does not respond", async () => {
  const w = workerHarness({
    clients: [
      {
        url: "https://example.com/inspect-hub/pl/inspection",
        postMessage() {},
      },
    ],
  });
  await w.event("message", { data: { type: "ACTIVATE_UPDATE" } });
  assert.equal(w.state.activated, 0);
});
