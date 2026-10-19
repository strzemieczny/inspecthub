import type { ReactNode, Ref } from "react";
import Feather from "@expo/vector-icons/Feather";
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
export function IconButton({
  icon,
  label,
  onPress,
  disabled,
  selected = false,
}: {
  icon: "settings" | "x";
  label: string;
  onPress: () => void;
  disabled?: boolean;
  selected?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.iconButton,
        selected && s.selected,
        (disabled || pressed) && s.dim,
      ]}
    >
      <Feather
        name={icon}
        size={21}
        color={selected ? colors.green : colors.muted}
        accessible={false}
        importantForAccessibility="no"
      />
    </Pressable>
  );
}
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
export function Field({
  label,
  inputRef,
  ...props
}: TextInputProps & { label: string; inputRef?: Ref<TextInput> }) {
  return (
    <View style={s.field}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        ref={inputRef}
        accessibilityLabel={label}
        placeholderTextColor={colors.muted}
        {...props}
        style={[s.input, props.style]}
      />
    </View>
  );
}
export function Photo({
  uri,
  label,
  result,
}: {
  uri: string;
  label: string;
  result?: "OK" | "NOK";
}) {
  return (
    <View style={s.photo}>
      <Text style={s.label}>{label}</Text>
      <Image
        accessibilityLabel={label}
        source={{ uri: mediaUrl(uri) }}
        style={[
          s.image,
          result === "OK" && s.imageOk,
          result === "NOK" && s.imageNok,
        ]}
        resizeMode="contain"
      />
    </View>
  );
}
export const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderColor: colors.line,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  headerBrand: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexShrink: 0,
  },
  brandMark: {
    width: 42,
    height: 42,
    resizeMode: "contain",
  },
  brand: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.ink,
  },
  headerInfo: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  headerTitle: {
    flexShrink: 1,
    fontSize: 16,
    fontWeight: "600",
    color: colors.ink,
  },
  headerMeta: { flexShrink: 2, fontSize: 13, color: colors.muted },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexShrink: 0,
  },
  headerOperator: {
    minHeight: 48,
    minWidth: 44,
    maxWidth: 200,
    paddingHorizontal: 6,
    paddingVertical: 6,
    borderRadius: 12,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  headerOperatorText: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: "500",
    color: colors.ink,
  },
  headerAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  headerAvatarActive: { backgroundColor: colors.pale },
  headerInitials: { fontSize: 12, fontWeight: "700", color: colors.green },
  iconButton: {
    flexShrink: 0,
    width: 44,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    padding: 28,
    gap: 22,
    width: "100%",
    maxWidth: 1040,
    alignSelf: "center",
    flexGrow: 1,
  },
  inspectionScroll: { flex: 1 },
  inspectionActions: {
    flexShrink: 0,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderColor: colors.line,
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
  imageOk: { borderWidth: 3, borderColor: colors.green },
  imageNok: { borderWidth: 3, borderColor: colors.red },
  answerRow: {
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderColor: colors.line,
    gap: 7,
  },
  answerHeading: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 12,
  },
  answerLabel: { flexGrow: 1, flexShrink: 1 },
  resultBadge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  resultPass: { backgroundColor: colors.pale, borderColor: colors.green },
  resultFail: { backgroundColor: "#fbecef", borderColor: colors.red },
  resultText: { fontSize: 17, fontWeight: "700" },
  resultPassText: { color: colors.green },
  resultFailText: { color: colors.red },
  modal: {
    flex: 1,
    backgroundColor: "#18202188",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  dialog: {
    flexGrow: 0,
    flexShrink: 1,
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
    maxHeight: "95%",
  },
  loginPanel: { gap: 16, padding: 22, borderRadius: 22 },
  loginTitle: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: "700",
    color: colors.ink,
  },
  loginNumber: {
    textAlign: "center",
    fontSize: 26,
    fontVariant: ["tabular-nums"],
    letterSpacing: 2,
    borderColor: "#a9c6b8",
    backgroundColor: colors.background,
  },
});
