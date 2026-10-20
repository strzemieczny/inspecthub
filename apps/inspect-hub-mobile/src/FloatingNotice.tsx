import { useI18n } from "./i18n";
import { useEffect, useRef, useState } from "react";
import Feather from "@expo/vector-icons/Feather";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { colors } from "./ui";

export function FloatingNotice({
  message,
  error = false,
  revision = 0,
  onDismiss,
}: {
  message: string;
  error?: boolean;
  revision?: number;
  onDismiss?: () => void;
}) {
  const { t } = useI18n();
  const [progress] = useState(() => new Animated.Value(0));
  // Retain the outgoing content until the native exit animation completes.
  const [displayed, setDisplayed] = useState(() =>
    message ? { message, error, revision } : null,
  );
  const dismissRef = useRef(onDismiss);
  useEffect(() => {
    dismissRef.current = onDismiss;
  }, [onDismiss]);

  const current = Boolean(
    displayed &&
    displayed.message === message &&
    displayed.error === error &&
    displayed.revision === revision,
  );

  useEffect(() => {
    let active = true;
    let reducedMotion = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let frame: number | undefined;
    let animation: Animated.CompositeAnimation | undefined;

    const listener = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      (reduced) => {
        reducedMotion = reduced;
        if (reduced) {
          animation?.stop();
          progress.setValue(current ? 1 : 0);
          if (!current) finishExit();
        }
      },
    );

    function finishExit() {
      if (!active) return;
      // A newer prop update cancels this effect, so an old completion cannot
      // clear or replace the next notification.
      setDisplayed(message ? { message, error, revision } : null);
    }

    function start(reduced: boolean) {
      if (!active) return;
      reducedMotion = reducedMotion || reduced;
      frame = requestAnimationFrame(() => {
        if (!active) return;
        if (!displayed) {
          if (message) finishExit();
          return;
        }
        if (reducedMotion) {
          progress.setValue(current ? 1 : 0);
          if (!current) finishExit();
        } else {
          animation = current
            ? Animated.spring(progress, {
                toValue: 1,
                damping: 22,
                stiffness: 240,
                mass: 0.8,
                useNativeDriver: true,
                isInteraction: false,
              })
            : Animated.timing(progress, {
                toValue: 0,
                duration: 180,
                easing: Easing.in(Easing.cubic),
                useNativeDriver: true,
                isInteraction: false,
              });
          animation.start(({ finished }) => {
            if (finished && !current) finishExit();
          });
        }
        if (current && !error && dismissRef.current) {
          timer = setTimeout(() => {
            if (active) dismissRef.current?.();
          }, 6000);
        }
      });
    }
    void AccessibilityInfo.isReduceMotionEnabled().then(start, () =>
      start(false),
    );

    return () => {
      active = false;
      if (timer) clearTimeout(timer);
      if (frame !== undefined) cancelAnimationFrame(frame);
      animation?.stop();
      progress.stopAnimation();
      listener.remove();
    };
  }, [current, displayed, message, error, revision, progress]);

  if (!displayed) return null;

  return (
    <Animated.View
      accessibilityLiveRegion={displayed.error ? "assertive" : "polite"}
      accessibilityRole={displayed.error ? "alert" : undefined}
      style={[
        styles.shadow,
        {
          opacity: progress.interpolate({
            inputRange: [0, 1],
            outputRange: [0, 1],
            extrapolate: "clamp",
          }),
          transform: [
            {
              translateY: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [-18, 0],
              }),
            },
            {
              scale: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [0.96, 1],
              }),
            },
          ],
        },
      ]}
    >
      <View style={[styles.glass, displayed.error && styles.errorGlass]}>
        <View style={[styles.icon, displayed.error && styles.errorIcon]}>
          <Feather
            name={displayed.error ? "alert-circle" : "check"}
            size={20}
            color={displayed.error ? colors.red : colors.green}
            accessible={false}
            importantForAccessibility="no"
          />
        </View>
        <Text style={styles.message}>{displayed.message}</Text>
        {onDismiss ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("Zamknij powiadomienie")}
            disabled={!current}
            onPress={() => dismissRef.current?.()}
            style={({ pressed }) => [
              styles.close,
              pressed && styles.closePressed,
            ]}
          >
            <Feather
              name="x"
              size={18}
              color={colors.muted}
              accessible={false}
              importantForAccessibility="no"
            />
          </Pressable>
        ) : null}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  shadow: {
    borderRadius: 22,
    backgroundColor: "rgba(243, 248, 245, 0.86)",
    shadowColor: "#163b2c",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 18,
    elevation: 8,
  },
  glass: {
    overflow: "hidden",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(82, 97, 93, 0.12)",
    backgroundColor: "rgba(240, 250, 244, 0.92)",
  },
  errorGlass: { backgroundColor: "rgba(255, 242, 243, 0.95)" },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(8, 127, 69, 0.09)",
    borderWidth: 1,
    borderColor: "rgba(8, 127, 69, 0.08)",
  },
  errorIcon: {
    backgroundColor: "rgba(198, 40, 50, 0.08)",
    borderColor: "rgba(198, 40, 50, 0.08)",
  },
  message: {
    flex: 1,
    color: colors.ink,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "500",
  },
  close: {
    width: 44,
    minHeight: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  closePressed: { backgroundColor: "rgba(24, 32, 33, 0.06)" },
});
