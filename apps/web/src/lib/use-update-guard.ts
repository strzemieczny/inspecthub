import { useLayoutEffect } from "react";
import { blockUpdates } from "./update-guard";

export function useUpdateGuard(blocked: boolean): void {
  useLayoutEffect(() => {
    if (blocked) return blockUpdates();
  }, [blocked]);
}
