import { NativeModule, requireOptionalNativeModule } from "expo";

export type Scan = { data: string; symbology: string; source: string };
type Events = {
  onScan: (scan: Scan) => void;
  onResult: (event: { result: string }) => void;
};
declare class ZebraDataWedge extends NativeModule<Events> {
  configure(): void;
  trigger(): void;
}
export const dataWedge =
  requireOptionalNativeModule<ZebraDataWedge>("ZebraDataWedge");
