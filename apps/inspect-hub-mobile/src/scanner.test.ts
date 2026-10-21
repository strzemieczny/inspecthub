import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveScannerResult,
  type ScannerConfiguration,
} from "../modules/zebra-datawedge/src/configuration.ts";

const ready: ScannerConfiguration = {
  profileName: "InspectHubMobile",
  profileEnabled: "true",
  appAssociated: true,
  barcodeEnabled: "true",
  intentEnabled: "true",
  intentAction: "com.inspecthub.mobile.SCAN",
  intentCategory: "android.intent.category.DEFAULT",
  intentDelivery: "2",
  keystrokeEnabled: "false",
};

test("a verified working profile succeeds despite a SET_CONFIG association error", () => {
  assert.deepEqual(
    resolveScannerResult({
      result: "FAILURE",
      details: "APP_LIST: APP_ALREADY_ASSOCIATED",
      configuration: ready,
    }),
    { result: "SUCCESS" },
  );
});

test("every required setting must be confirmed even if SET_CONFIG succeeds", () => {
  for (const field of Object.keys(ready) as (keyof ScannerConfiguration)[]) {
    const configuration = {
      ...ready,
      [field]: field === "appAssociated" ? false : "",
    };
    const result = resolveScannerResult({ result: "SUCCESS", configuration });
    assert.equal(result.result, "FAILURE", field);
    assert.ok(result.details, field);
  }
});

test("association with a different profile remains an error with its original cause", () => {
  const result = resolveScannerResult({
    result: "FAILURE",
    details: "APP_ALREADY_ASSOCIATED",
    configuration: { ...ready, appAssociated: false },
  });
  assert.equal(result.result, "FAILURE");
  assert.match(result.details!, /APP_ALREADY_ASSOCIATED/);
  assert.match(result.details!, /APP_LIST/);
});

test("DataWedge boolean casing does not produce a false failure", () => {
  assert.equal(
    resolveScannerResult({
      result: "SUCCESS",
      configuration: {
        ...ready,
        profileEnabled: "True",
        barcodeEnabled: "TRUE",
        keystrokeEnabled: "False",
      },
    }).result,
    "SUCCESS",
  );
});

test("timeouts and API errors without a profile are preserved", () => {
  for (const result of ["TIMEOUT", "FAILURE", "UNKNOWN"]) {
    const event = { result, details: "DATAWEDGE_DISABLED" };
    assert.deepEqual(resolveScannerResult(event), event);
  }
});
