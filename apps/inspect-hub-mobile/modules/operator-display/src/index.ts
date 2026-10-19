import { NativeModule, requireOptionalNativeModule } from "expo";

declare class OperatorDisplay extends NativeModule {
  activate(): void;
  deactivate(): void;
}

export const operatorDisplay =
  requireOptionalNativeModule<OperatorDisplay>("OperatorDisplay");
