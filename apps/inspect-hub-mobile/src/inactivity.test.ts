import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { INACTIVITY_TIMEOUT_MS, monitorInactivity } from "./inactivity.ts";

function setup(t: TestContext, lastActiveAt = 1000) {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 1000 });
  let expirations = 0;
  const activities: number[] = [];
  const monitor = monitorInactivity({
    lastActiveAt,
    onExpire: () => expirations++,
    onActivity: (timestamp) => activities.push(timestamp),
  });
  t.after(() => monitor.stop());
  return { monitor, activities, expirations: () => expirations };
}

test("logout happens only after more than 5 minutes and only once", (t) => {
  const state = setup(t);
  t.mock.timers.tick(INACTIVITY_TIMEOUT_MS);
  assert.equal(state.expirations(), 0);
  t.mock.timers.tick(1);
  assert.equal(state.expirations(), 1);
  assert.equal(state.monitor.activity(), false);
  assert.equal(state.monitor.check(), false);
  assert.equal(state.expirations(), 1);
  assert.deepEqual(state.activities, []);
});

test("user activity extends the deadline", (t) => {
  const state = setup(t);
  t.mock.timers.tick(INACTIVITY_TIMEOUT_MS - 1);
  assert.equal(state.monitor.activity(), true);
  assert.deepEqual(state.activities, [1000 + INACTIVITY_TIMEOUT_MS - 1]);
  t.mock.timers.tick(INACTIVITY_TIMEOUT_MS);
  assert.equal(state.expirations(), 0);
  t.mock.timers.tick(1);
  assert.equal(state.expirations(), 1);
});

test("returning from suspended timers checks elapsed wall-clock time", (t) => {
  const state = setup(t);
  t.mock.timers.setTime(1000 + INACTIVITY_TIMEOUT_MS + 1);
  assert.equal(state.monitor.check(), false);
  assert.equal(state.expirations(), 1);
});

test("first interaction after suspension cannot renew an expired session", (t) => {
  const state = setup(t);
  t.mock.timers.setTime(1000 + INACTIVITY_TIMEOUT_MS + 1);
  assert.equal(state.monitor.activity(), false);
  assert.deepEqual(state.activities, []);
  assert.equal(state.expirations(), 1);
});

test("restoring a session preserves its remaining inactivity time", (t) => {
  const state = setup(t, 1000 - INACTIVITY_TIMEOUT_MS + 5000);
  t.mock.timers.tick(5000);
  assert.equal(state.expirations(), 0);
  t.mock.timers.tick(1);
  assert.equal(state.expirations(), 1);
});

test("an already expired saved session expires immediately", (t) => {
  const state = setup(t, 1000 - INACTIVITY_TIMEOUT_MS - 1);
  assert.equal(state.expirations(), 1);
});

test("cleanup cancels pending logout", (t) => {
  const state = setup(t);
  state.monitor.stop();
  t.mock.timers.tick(INACTIVITY_TIMEOUT_MS + 1);
  assert.equal(state.expirations(), 0);
});
