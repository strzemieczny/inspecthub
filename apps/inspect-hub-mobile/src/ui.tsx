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
  green: "#087f45",
  pale: "#dff5e8",
  greenSelected: "#bceccd",
  red: "#c62832",
  redPale: "#ffe5e8",
  redSelected: "#ffcbd0",
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
        disabled && s.dim,
        pressed && s.pressed,
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
  result,
}: {
  children: ReactNode;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
  selected?: boolean;
  danger?: boolean;
  result?: "OK" | "NOK";
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
        danger && secondary && s.dangerSecondary,
        danger && secondary && selected && s.dangerSecondarySelected,
        result === "OK" && s.photoOk,
        result === "NOK" && s.photoNok,
        selected && result === "OK" && s.photoSelectedOk,
        selected && result === "NOK" && s.photoSelectedNok,
        disabled && s.dim,
        pressed && s.pressed,
      ]}
    >
      <Text
        style={[
          s.buttonText,
          secondary && s.secondaryText,
          selected && s.selectedText,
          danger && s.dangerText,
          danger && secondary && s.dangerSecondaryText,
          result === "OK" && s.resultPassText,
          result === "NOK" && s.resultFailText,
          result && selected && s.answerSelectedText,
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
  onPress,
  selected = false,
  disabled = false,
  fit = false,
  height = 240,
}: {
  uri: string;
  label: string;
  result?: "OK" | "NOK";
  onPress?: () => void;
  selected?: boolean;
  disabled?: boolean;
  fit?: boolean;
  height?: number;
}) {
  const frameStyles = [
    s.photo,
    fit && s.photoFit,
    result && s.photoFrame,
    result === "OK" && s.photoOk,
    result === "NOK" && s.photoNok,
    selected && s.photoSelected,
    selected && result === "OK" && s.photoSelectedOk,
    selected && result === "NOK" && s.photoSelectedNok,
  ];
  const content = (
    <>
      <View style={result && s.photoHeading}>
        {result ? (
          <View style={s.photoStatusIcon}>
            <Feather
              name={result === "OK" ? "check" : "x"}
              size={20}
              color={result === "OK" ? colors.green : colors.red}
              accessible={false}
              importantForAccessibility="no"
            />
          </View>
        ) : null}
        <Text
          style={[
            s.label,
            result && s.photoHeadingText,
            result === "OK" && s.resultPassText,
            result === "NOK" && s.resultFailText,
            result && selected && s.answerSelectedText,
          ]}
        >
          {label}
        </Text>
      </View>
      <Image
        accessibilityLabel={label}
        source={{ uri: mediaUrl(uri) }}
        style={[
          s.image,
          { height },
          result && s.photoFrameImage,
          fit && s.photoFitImage,
        ]}
        resizeMode="contain"
      />
    </>
  );
  return onPress ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [frameStyles, pressed && s.pressed]}
    >
      {content}
    </Pressable>
  ) : (
    <View style={frameStyles}>{content}</View>
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
  inspectionBody: { flex: 1 },
  inspectionScroll: { flex: 1 },
  noticeOverlay: {
    position: "absolute",
    top: 12,
    width: "100%",
    maxWidth: 1016,
    paddingHorizontal: 16,
    alignSelf: "center",
    gap: 10,
    zIndex: 1,
  },
  photoQuestionContent: { flex: 1, minHeight: 0, padding: 16, gap: 10 },
  photoQuestionPanel: { flex: 1, minHeight: 0, padding: 16, gap: 10 },
  photoQuestionTitle: { fontSize: 26, lineHeight: 32 },
  photoQuestionReferences: {
    flex: 1,
    minHeight: 0,
    flexWrap: "nowrap",
    alignItems: "stretch",
  },
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
  selected: {
    backgroundColor: colors.greenSelected,
    borderColor: colors.green,
  },
  selectedText: { color: colors.green },
  danger: { backgroundColor: colors.red, borderColor: colors.red },
  dangerText: { color: colors.white },
  dangerSecondary: { backgroundColor: colors.white, borderColor: "#d75b66" },
  dangerSecondarySelected: {
    backgroundColor: colors.redSelected,
    borderColor: colors.red,
  },
  dangerSecondaryText: { color: colors.red },
  dim: { opacity: 0.45 },
  pressed: { transform: [{ scale: 0.99 }] },
  notice: {
    backgroundColor: colors.pale,
    borderLeftWidth: 5,
    borderColor: colors.green,
    padding: 18,
    borderRadius: 8,
  },
  error: { backgroundColor: "#fbecef", borderColor: colors.red },
  progressGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    minHeight: 24,
  },
  progressLabel: {
    fontSize: 15,
    fontWeight: "500",
    color: colors.muted,
    flexShrink: 1,
  },
  progress: {
    flex: 1,
    height: 6,
    backgroundColor: "#dce5df",
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: colors.green },
  serial: {
    fontSize: 28,
    fontWeight: "700",
    color: colors.ink,
    fontFamily: "monospace",
  },
  photo: { gap: 10, flexGrow: 1, minWidth: 220 },
  photoFit: { flex: 1, flexBasis: 0, minHeight: 0, minWidth: 0 },
  photoFitImage: { height: undefined, flex: 1, minHeight: 0 },
  image: {
    height: 240,
    width: "100%",
    borderRadius: 8,
  },
  photoFrame: {
    gap: 0,
    padding: 8,
    borderRadius: 20,
    borderWidth: 1,
    boxShadow: [
      {
        offsetX: 0,
        offsetY: 2,
        blurRadius: 4,
        color: "rgba(24, 32, 33, 0.06)",
      },
      {
        offsetX: 0,
        offsetY: 10,
        blurRadius: 24,
        spreadDistance: -6,
        color: "rgba(24, 32, 33, 0.16)",
      },
    ],
  },
  photoOk: { backgroundColor: colors.pale, borderColor: "#59b981" },
  photoNok: { backgroundColor: colors.redPale, borderColor: "#e87983" },
  photoSelected: { borderWidth: 3, padding: 6 },
  photoSelectedOk: {
    backgroundColor: colors.green,
    borderColor: colors.green,
  },
  photoSelectedNok: {
    backgroundColor: colors.red,
    borderColor: colors.red,
  },
  answerSelectedText: { color: colors.white },
  photoHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 6,
    paddingTop: 2,
    paddingBottom: 10,
  },
  photoStatusIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.white,
    boxShadow: [
      {
        offsetX: 0,
        offsetY: 2,
        blurRadius: 4,
        color: "rgba(24, 32, 33, 0.08)",
      },
    ],
  },
  photoHeadingText: { flexShrink: 1 },
  photoFrameImage: { borderRadius: 12, backgroundColor: colors.white },
  summaryPanel: { padding: 18, gap: 0 },
  answerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderColor: colors.line,
    gap: 16,
  },
  answerContent: { flex: 1, minWidth: 0, gap: 6 },
  answerLabel: { lineHeight: 24 },
  resultBadge: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    minWidth: 82,
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  resultPass: { backgroundColor: colors.pale, borderColor: colors.green },
  resultFail: { backgroundColor: "#fbecef", borderColor: colors.red },
  resultText: { fontSize: 17, fontWeight: "700" },
  summaryFooter: { paddingTop: 18, gap: 14 },
  summaryResult: {
    padding: 16,
    borderRadius: 10,
    borderWidth: 1,
    gap: 6,
  },
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
  discardPanel: { padding: 28, gap: 20, borderRadius: 22 },
  discardIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: "#fbecef",
    alignItems: "center",
    justifyContent: "center",
  },
  discardSubject: {
    gap: 6,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.line,
  },
  discardAction: { flexGrow: 1, flexBasis: 180 },
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
