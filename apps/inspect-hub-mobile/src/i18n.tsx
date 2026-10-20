import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { ActivityIndicator, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { resolveLanguage, translate, type Language } from "./localization";

const languageKey = "inspect-hub-mobile.language.v1";
type I18n = {
  language: Language;
  setLanguage: (language: Language) => Promise<void>;
  t: (source: string, params?: Record<string, string | number>) => string;
};
const Context = createContext<I18n | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, updateLanguage] = useState<Language>("pl");
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    async function restore() {
      let initial: Language = "pl";
      try {
        initial = resolveLanguage(
          Intl.DateTimeFormat().resolvedOptions().locale,
        );
        const saved = await AsyncStorage.getItem(languageKey);
        if (saved) initial = resolveLanguage(saved);
      } catch {
        /* Use the device language, or Polish if it is unavailable. */
      }
      if (active) {
        updateLanguage(initial);
        setReady(true);
      }
    }
    void restore();
    return () => {
      active = false;
    };
  }, []);
  const setLanguage = useCallback(async (next: Language) => {
    await AsyncStorage.setItem(languageKey, next);
    updateLanguage(next);
  }, []);
  const t = useCallback(
    (source: string, params?: Record<string, string | number>) =>
      translate(language, source, params),
    [language],
  );
  const value = useMemo(
    () => ({ language, setLanguage, t }),
    [language, setLanguage, t],
  );
  return (
    <Context.Provider value={value}>
      {ready ? (
        children
      ) : (
        <View style={{ flex: 1, justifyContent: "center" }}>
          <ActivityIndicator />
        </View>
      )}
    </Context.Provider>
  );
}

export function useI18n() {
  const value = useContext(Context);
  if (!value) throw new Error("LanguageProvider is missing");
  return value;
}
