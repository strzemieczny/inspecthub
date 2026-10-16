import type { ReactNode } from "react";
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import { mediaUrl } from "./api";

export const colors = {
  ink: "#182021",
  muted: "#52615d",
  background: "#f3f5f2",
  line: "#d9e2dc",
  green: "#14795c",
  pale: "#e7f2ed",
  red: "#a52c35",
  white: "#ffffff",
};
export function Button({
  children,
  onPress,
  disabled,
  secondary = false,
  selected = false,
  danger = false,
}: {
  children: ReactNode;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
  selected?: boolean;
  danger?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        secondary && s.secondary,
        selected && s.selected,
        danger && s.danger,
        (disabled || pressed) && s.dim,
      ]}
    >
      <Text
        style={[
          s.buttonText,
          secondary && s.secondaryText,
          selected && s.selectedText,
        ]}
      >
        {children}
      </Text>
    </Pressable>
  );
}
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={s.field}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.muted}
        {...props}
        style={[s.input, props.style]}
      />
    </View>
  );
}
export function Photo({ uri, label }: { uri: string; label: string }) {
  return (
    <View style={s.photo}>
      <Text style={s.label}>{label}</Text>
      <Image
        accessibilityLabel={label}
        source={{ uri: mediaUrl(uri) }}
        style={s.image}
        resizeMode="contain"
      />
    </View>
  );
}
export const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    paddingHorizontal: 28,
    paddingVertical: 18,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderColor: colors.line,
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 18,
  },
  brand: { fontSize: 25, fontWeight: "800", color: colors.green },
  headerInfo: { flex: 1, minWidth: 180, gap: 3 },
  headerTitle: { fontSize: 17, fontWeight: "700", color: colors.ink },
  content: {
    padding: 28,
    gap: 22,
    width: "100%",
    maxWidth: 1040,
    alignSelf: "center",
    flexGrow: 1,
  },
  title: { fontSize: 32, lineHeight: 39, fontWeight: "700", color: colors.ink },
  subtitle: { fontSize: 20, lineHeight: 29, color: colors.muted },
  body: { fontSize: 18, lineHeight: 27, color: colors.ink },
  muted: { fontSize: 15, lineHeight: 22, color: colors.muted },
  panel: {
    backgroundColor: colors.white,
    padding: 26,
    borderRadius: 16,
    gap: 22,
    borderWidth: 1,
    borderColor: colors.line,
  },
  row: {
    flexDirection: "row",
    gap: 14,
    flexWrap: "wrap",
    alignItems: "center",
  },
  column: { flex: 1, minWidth: 230, gap: 16 },
  field: { gap: 9 },
  label: { fontSize: 17, fontWeight: "600", color: colors.ink },
  input: {
    minHeight: 60,
    borderWidth: 1,
    borderColor: "#9baea3",
    borderRadius: 9,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: colors.white,
    fontSize: 21,
    color: colors.ink,
  },
  button: {
    minHeight: 60,
    paddingHorizontal: 25,
    paddingVertical: 16,
    borderRadius: 9,
    backgroundColor: colors.green,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "transparent",
  },
  buttonText: {
    fontSize: 19,
    fontWeight: "700",
    color: colors.white,
    textAlign: "center",
  },
  secondary: { backgroundColor: colors.white, borderColor: colors.line },
  secondaryText: { color: colors.ink },
  selected: { backgroundColor: colors.pale, borderColor: colors.green },
  selectedText: { color: colors.green },
  danger: { backgroundColor: colors.red },
  dim: { opacity: 0.45 },
  notice: {
    backgroundColor: colors.pale,
    borderLeftWidth: 5,
    borderColor: colors.green,
    padding: 18,
    borderRadius: 8,
  },
  error: { backgroundColor: "#fbecef", borderColor: colors.red },
  progress: {
    height: 7,
    backgroundColor: colors.line,
    borderRadius: 4,
    overflow: "hidden",
  },
  progressFill: { height: 7, backgroundColor: colors.green },
  serial: {
    fontSize: 28,
    fontWeight: "700",
    color: colors.ink,
    fontFamily: "monospace",
  },
  photo: { gap: 10, flexGrow: 1, minWidth: 220 },
  image: {
    height: 240,
    width: "100%",
    backgroundColor: colors.background,
    borderRadius: 8,
  },
  answerRow: {
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderColor: colors.line,
    gap: 7,
  },
  modal: {
    flex: 1,
    backgroundColor: "#18202188",
    justifyContent: "center",
    padding: 24,
  },
  dialog: {
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
    maxHeight: "95%",
  },
});
