import { NativeModule, requireOptionalNativeModule } from "expo";
import type { ScannerResult } from "./configuration";
export { resolveScannerResult, type ScannerResult } from "./configuration";

export type Scan = { data: string; symbology: string; source: string };
type Events = {
  onScan: (scan: Scan) => void;
  onResult: (event: ScannerResult) => void;
};
declare class ZebraDataWedge extends NativeModule<Events> {
  configure(): void;
  trigger(): void;
}
export const dataWedge =
  requireOptionalNativeModule<ZebraDataWedge>("ZebraDataWedge");
