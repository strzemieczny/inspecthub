import { useState } from "react";
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ImageSourcePropType,
} from "react-native";
import Feather from "@expo/vector-icons/Feather";
import { PlFlagSource } from "react-native-circle-flags/country/pl-flag";
import { GbFlagSource } from "react-native-circle-flags/country/gb-flag";
import { UaFlagSource } from "react-native-circle-flags/country/ua-flag";
import { useI18n } from "./i18n";
import { languages, languageNames, type Language } from "./localization";
import { Button, colors, s } from "./ui";

const languageFlags: Record<Language, ImageSourcePropType> = {
  pl: PlFlagSource,
  en: GbFlagSource,
  uk: UaFlagSource,
};

export function LanguagePicker({
  disabled,
  onOpenChange,
  onActivity,
}: {
  disabled: boolean;
  onOpenChange: (open: boolean) => void;
  onActivity: () => void;
}) {
  const { language, setLanguage, t } = useI18n();
  const [open, setOpen] = useState(false);
  function changeOpen(next: boolean) {
    setOpen(next);
    onOpenChange(next);
  }
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${t("Język")}: ${languageNames[language]}`}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={() => {
          setError(false);
          changeOpen(true);
        }}
        style={({ pressed }) => [
          s.iconButton,
          disabled && s.dim,
          pressed && s.pressed,
        ]}
      >
        <Image
          source={languageFlags[language]}
          style={styles.flag}
          accessible={false}
          importantForAccessibility="no"
        />
      </Pressable>
      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!saving) changeOpen(false);
        }}
      >
        <View
          style={s.modal}
          onTouchStart={onActivity}
          onTouchMove={onActivity}
        >
          <ScrollView
            style={s.dialog}
            contentContainerStyle={s.panel}
            accessibilityViewIsModal
          >
            <Text style={s.loginTitle} accessibilityRole="header">
              {t("Język")}
            </Text>
            {languages.map((next) => (
              <Pressable
                key={next}
                accessibilityRole="button"
                accessibilityLabel={languageNames[next]}
                accessibilityState={{
                  selected: next === language,
                  disabled: saving,
                }}
                disabled={saving}
                style={({ pressed }) => [
                  styles.option,
                  next === language && styles.optionSelected,
                  saving && s.dim,
                  pressed && s.pressed,
                ]}
                onPress={() => {
                  setSaving(true);
                  setError(false);
                  void setLanguage(next)
                    .then(
                      () => changeOpen(false),
                      () => setError(true),
                    )
                    .finally(() => setSaving(false));
                }}
              >
                <Image
                  source={languageFlags[next]}
                  style={styles.flag}
                  accessible={false}
                  importantForAccessibility="no"
                />
                <Text
                  style={[
                    styles.optionLabel,
                    next === language && styles.optionLabelSelected,
                  ]}
                >
                  {languageNames[next]}
                </Text>
                {next === language ? (
                  <Feather
                    name="check"
                    size={19}
                    color={colors.green}
                    accessible={false}
                    importantForAccessibility="no"
                  />
                ) : null}
              </Pressable>
            ))}
            {error ? (
              <Text
                style={[s.body, s.resultFailText]}
                accessibilityLiveRegion="polite"
              >
                {t("Nie udało się zapisać języka. Spróbuj ponownie.")}
              </Text>
            ) : null}
            <Button
              secondary
              disabled={saving}
              onPress={() => changeOpen(false)}
            >
              {t("Zamknij")}
            </Button>
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  flag: { width: 28, height: 28, borderRadius: 14 },
  option: {
    minHeight: 62,
    paddingHorizontal: 18,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
  },
  optionSelected: { borderColor: colors.green, backgroundColor: colors.pale },
  optionLabel: { flex: 1, fontSize: 18, fontWeight: "500", color: colors.ink },
  optionLabelSelected: { color: colors.green },
});
