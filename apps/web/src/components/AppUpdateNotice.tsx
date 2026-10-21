import { useSyncExternalStore } from "react";
import { subscribeToAppUpdates, updateAvailable } from "../lib/app-updates";
import { useI18n } from "../lib/i18n";
import "./AppUpdateNotice.css";

export function AppUpdateNotice() {
  const available = useSyncExternalStore(
    subscribeToAppUpdates,
    updateAvailable,
  );
  const { language } = useI18n();
  if (!available) return null;
  const message =
    language === "pl"
      ? "Dostępna jest nowa wersja. Aplikacja odświeży się automatycznie po zakończeniu pracy i zapisaniu zmian we wszystkich kartach."
      : language === "uk"
        ? "Доступна нова версія. Застосунок оновиться автоматично після завершення роботи та збереження змін у всіх вкладках."
        : "A new version is available. The app will refresh automatically when you finish your work and save changes in all tabs.";
  return (
    <aside className="app-update-notice" role="status">
      {message}
    </aside>
  );
}
