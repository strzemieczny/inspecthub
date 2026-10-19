import Feather from "@expo/vector-icons/Feather";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "./ui";

const rows = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
  ["clear", "0", "backspace"],
] as const;

export function NumericKeypad({
  value,
  onChange,
  maxLength,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  disabled: boolean;
}) {
  return (
    <View style={styles.keypad} accessibilityLabel="Klawiatura numeryczna">
      {rows.map((row, index) => (
        <View key={index} style={styles.row}>
          {row.map((key) => {
            const action = key === "clear" || key === "backspace";
            const unavailable =
              disabled || (action ? !value : value.length >= maxLength);
            return (
              <Pressable
                key={key}
                accessibilityRole="button"
                accessibilityLabel={
                  key === "clear"
                    ? "Wyczyść numer"
                    : key === "backspace"
                      ? "Usuń ostatnią cyfrę"
                      : key
                }
                accessibilityState={{ disabled: unavailable }}
                disabled={unavailable}
                onPress={() =>
                  onChange(
                    key === "clear"
                      ? ""
                      : key === "backspace"
                        ? value.slice(0, -1)
                        : `${value}${key}`,
                  )
                }
                style={({ pressed }) => [
                  styles.key,
                  action && styles.action,
                  pressed && styles.pressed,
                  unavailable && styles.disabled,
                ]}
              >
                {key === "backspace" ? (
                  <Feather
                    name="delete"
                    size={23}
                    color={colors.muted}
                    accessible={false}
                    importantForAccessibility="no"
                  />
                ) : (
                  <Text style={action ? styles.actionText : styles.digit}>
                    {key === "clear" ? "Wyczyść" : key}
                  </Text>
                )}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  keypad: { gap: 8 },
  row: { flexDirection: "row", gap: 8 },
  key: {
    flex: 1,
    minHeight: 62,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.line,
  },
  digit: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "500",
    fontVariant: ["tabular-nums"],
    color: colors.ink,
  },
  action: { backgroundColor: colors.white, borderColor: colors.white },
  actionText: { fontSize: 13, fontWeight: "600", color: colors.muted },
  pressed: {
    backgroundColor: colors.pale,
    borderColor: colors.green,
    transform: [{ scale: 0.97 }],
  },
  disabled: { opacity: 0.35 },
});
