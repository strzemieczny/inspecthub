import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing } from "react-native";

export function useInspectionProgress(
  inspectionId: string | null,
  completed: number,
  total: number,
) {
  const value = total > 0 ? Math.max(0, Math.min(1, completed / total)) : 0;
  const [progress] = useState(() => new Animated.Value(value));
  const target = useRef(value);
  const previousInspection = useRef(inspectionId);
  const reducedMotion = useRef(false);

  useEffect(() => {
    let active = true;
    let changed = false;
    function applyPreference(reduced: boolean) {
      reducedMotion.current = reduced;
      if (reduced) {
        progress.stopAnimation();
        progress.setValue(target.current);
      }
    }
    const listener = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      (reduced) => {
        changed = true;
        applyPreference(reduced);
      },
    );
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((reduced) => {
        if (active && !changed) applyPreference(reduced);
      })
      .catch(() => {});
    return () => {
      active = false;
      listener.remove();
    };
  }, [progress]);

  useEffect(() => {
    target.current = value;
    if (previousInspection.current !== inspectionId || reducedMotion.current) {
      previousInspection.current = inspectionId;
      progress.setValue(value);
      return;
    }
    const animation = Animated.timing(progress, {
      toValue: value,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
      isInteraction: false,
    });
    animation.start();
    return () => animation.stop();
  }, [inspectionId, value, progress]);

  return progress;
}
