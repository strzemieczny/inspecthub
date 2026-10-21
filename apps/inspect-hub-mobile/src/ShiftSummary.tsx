import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Feather from "@expo/vector-icons/Feather";
import type { ShiftSummary as Summary } from "@inspect-hub/types";
import { api } from "./api";
import { useI18n } from "./i18n";
import { currentShift } from "./shift";
import { colors } from "./ui";

const clockFormat = new Intl.DateTimeFormat("pl-PL", {
  timeZone: "Europe/Warsaw",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function ShiftClock() {
  const { t } = useI18n();
  const [time, setTime] = useState(() => clockFormat.format(new Date()));

  useEffect(() => {
    const update = () => setTime(clockFormat.format(new Date()));
    const timer = setInterval(() => {
      if (AppState.currentState === "active") update();
    }, 1000);
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active") update();
    });
    return () => {
      clearInterval(timer);
      listener.remove();
    };
  }, []);

  return (
    <View
      style={styles.clock}
      accessible
      accessibilityLabel={t("Aktualny czas polski: {time}", { time })}
    >
      <Feather name="clock" size={19} color={colors.muted} accessible={false} />
      <Text style={styles.clockTime}>{time}</Text>
    </View>
  );
}

export function ShiftSummary({ stationCode }: { stationCode: string }) {
  const { t } = useI18n();
  const [data, setData] = useState<{
    summary: Summary;
    shift: ReturnType<typeof currentShift>;
  } | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    let running = false;
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      if (!active || running || AppState.currentState === "background") return;
      clearTimeout(timer);
      running = true;
      const shift = currentShift();
      const query = new URLSearchParams({
        stationCode,
        from: shift.from.toISOString(),
        to: shift.to.toISOString(),
      });
      try {
        const summary = await api<Summary>(
          `/inspections/shift-summary?${query}`,
        );
        if (active) {
          setData({ summary, shift });
          setFailed(false);
        }
      } catch {
        if (active) {
          setData(null);
          setFailed(true);
        }
      } finally {
        running = false;
        if (active) timer = setTimeout(() => void refresh(), 60_000);
      }
    }
    void refresh();
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active") void refresh();
    });
    return () => {
      active = false;
      clearTimeout(timer);
      listener.remove();
    };
  }, [stationCode, retry]);

  const shift = data?.shift ?? currentShift();
  const summary = data?.summary;
  return (
    <View style={styles.panel}>
      <View style={styles.heading}>
        <Feather name="bar-chart-2" size={20} color={colors.green} />
        <Text accessibilityRole="header" style={styles.title}>
          {t("Podsumowanie zmiany")}
        </Text>
        <ShiftClock />
      </View>
      <Text style={styles.meta}>
        {t("Zmiana {number}", { number: shift.number })} · {shift.hours}
      </Text>
      <Text style={styles.scope}>
        {t("Stanowisko {code} · czas polski", { code: stationCode })}
      </Text>
      {summary ? (
        <>
          <View style={styles.metrics}>
            {[
              {
                label: t("Inspekcje"),
                value: summary.total,
                color: colors.ink,
              },
              { label: "OK", value: summary.passed, color: colors.green },
              { label: "NOK", value: summary.failed, color: colors.red },
            ].map(({ label, value, color }) => (
              <View
                key={label}
                style={styles.metric}
                accessible
                accessibilityLabel={`${label}: ${value}`}
              >
                <Text style={[styles.value, { color }]}>{value}</Text>
                <Text style={styles.label}>{label}</Text>
              </View>
            ))}
          </View>
          <View
            style={styles.bar}
            accessible
            accessibilityLabel={t("Wyniki: {passed} OK, {failed} NOK", {
              passed: summary.passed,
              failed: summary.failed,
            })}
          >
            {summary.passed > 0 ? (
              <View
                style={{ flex: summary.passed, backgroundColor: colors.green }}
              />
            ) : null}
            {summary.failed > 0 ? (
              <View
                style={{ flex: summary.failed, backgroundColor: colors.red }}
              />
            ) : null}
          </View>
          <Text style={styles.scope}>
            {t(
              summary.total
                ? "Zapisane inspekcje wszystkich operatorów."
                : "Pierwsza inspekcja tej zmiany przed Tobą.",
            )}
          </Text>
        </>
      ) : failed ? (
        <View style={styles.failure}>
          <Text style={styles.label}>
            {t("Nie udało się pobrać podsumowania.")}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => setRetry((value) => value + 1)}
            style={styles.retry}
          >
            <Text style={styles.retryText}>{t("Odśwież podsumowanie")}</Text>
          </Pressable>
        </View>
      ) : (
        <ActivityIndicator
          accessibilityLabel={t("Ładowanie podsumowania zmiany")}
          color={colors.green}
          style={styles.loading}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 18,
    padding: 20,
    gap: 8,
  },
  heading: { flexDirection: "row", alignItems: "center", gap: 10 },
  clock: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 5,
    flexShrink: 0,
    paddingTop: 3,
  },
  clockTime: {
    fontSize: 20,
    fontWeight: "600",
    color: colors.muted,
    fontVariant: ["tabular-nums"],
  },
  title: { flex: 1, fontSize: 20, fontWeight: "700", color: colors.ink },
  meta: { fontSize: 16, fontWeight: "600", color: colors.ink },
  scope: { fontSize: 13, lineHeight: 19, color: colors.muted },
  metrics: { flexDirection: "row", paddingVertical: 12, gap: 12 },
  metric: { flex: 1, minWidth: 0, gap: 2 },
  value: { fontSize: 34, fontWeight: "700", fontVariant: ["tabular-nums"] },
  label: { fontSize: 15, color: colors.muted },
  bar: {
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
    flexDirection: "row",
    backgroundColor: colors.line,
    marginBottom: 4,
  },
  loading: { padding: 28 },
  failure: { paddingTop: 12, gap: 4 },
  retry: { minHeight: 44, justifyContent: "center", alignSelf: "flex-start" },
  retryText: { color: colors.green, fontSize: 15, fontWeight: "600" },
});
