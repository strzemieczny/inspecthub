export type ScannerConfiguration = {
  profileName: string;
  profileEnabled: string;
  appAssociated: boolean;
  barcodeEnabled: string;
  intentEnabled: string;
  intentAction: string;
  intentCategory: string;
  intentDelivery: string;
  keystrokeEnabled: string;
};

export type ScannerResult = {
  result: string;
  details?: string;
  configuration?: ScannerConfiguration;
};

// Judge the saved profile, including when SET_CONFIG reports a failure for an
// association that is already in place. Never ignore a conflict in another profile.
export function resolveScannerResult(event: ScannerResult): ScannerResult {
  const config = event.configuration;
  if (!config) return event;
  const mismatches: string[] = [];
  const check = (valid: boolean, field: string) => {
    if (!valid) mismatches.push(field);
  };
  check(config.profileName === "InspectHubMobile", "PROFILE_NAME");
  check(config.profileEnabled.toLowerCase() === "true", "PROFILE_ENABLED");
  check(config.appAssociated, "APP_LIST");
  check(
    config.barcodeEnabled.toLowerCase() === "true",
    "BARCODE.scanner_input_enabled",
  );
  check(
    config.intentEnabled.toLowerCase() === "true",
    "INTENT.intent_output_enabled",
  );
  check(
    config.intentAction === "com.inspecthub.mobile.SCAN",
    "INTENT.intent_action",
  );
  check(
    config.intentCategory === "android.intent.category.DEFAULT",
    "INTENT.intent_category",
  );
  check(config.intentDelivery === "2", "INTENT.intent_delivery");
  check(
    config.keystrokeEnabled.toLowerCase() === "false",
    "KEYSTROKE.keystroke_output_enabled",
  );
  return mismatches.length === 0
    ? { result: "SUCCESS" }
    : {
        result: "FAILURE",
        details: [event.details, ...mismatches].filter(Boolean).join("; "),
      };
}
