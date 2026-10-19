/// <reference types="node" />
import assert from "node:assert/strict";
import { test } from "node:test";
import { appPath, appRoute, currentAppPath } from "./routing.ts";

test("routes and assets stay under the deployment prefix", () => {
  assert.equal(
    appPath("/branding/logo.png", "/inspect-hub"),
    "/inspect-hub/branding/logo.png",
  );
  assert.equal(
    appRoute("uk", "/reports/123#answers", "/inspect-hub"),
    "/inspect-hub/ua/reports/123#answers",
  );
  assert.equal(appRoute("pl", "/admin", ""), "/pl/admin");
});

test("route parsing removes only the complete application prefix", () => {
  assert.equal(
    currentAppPath("/inspect-hub/pl/admin", "/inspect-hub"),
    "/pl/admin",
  );
  assert.equal(currentAppPath("/inspect-hub", "/inspect-hub"), "/");
  assert.equal(currentAppPath("/inspect-hub/", "/inspect-hub"), "/");
  assert.equal(
    currentAppPath("/inspect-hub-other/pl", "/inspect-hub"),
    "/inspect-hub-other/pl",
  );
  assert.equal(currentAppPath("/en/login", ""), "/en/login");
});
