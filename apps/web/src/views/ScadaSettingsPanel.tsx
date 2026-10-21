import { ViewSkeleton } from "../components/ViewSkeleton";
import type { ScadaSettings } from "@inspect-hub/types";
import { useEffect, useState, type FormEvent } from "react";
import { api } from "../lib/api";

import { useUpdateGuard } from "../lib/use-update-guard";
import { useI18n } from "../lib/i18n";

export default function ScadaSettingsPanel() {
  const { t } = useI18n();
  const [settings, setSettings] = useState<ScadaSettings | null>(null);
  const [savedSettings, setSavedSettings] = useState("");
  useUpdateGuard(!settings || JSON.stringify(settings) !== savedSettings);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  useUpdateGuard(busy);

  useEffect(() => {
    void api<ScadaSettings>("/scada/settings")
      .then((value) => {
        setSettings(value);
        setSavedSettings(JSON.stringify(value));
      })
      .catch((error: Error) => setNotice(error.message));
  }, []);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!settings) return;
    setBusy(true);
    setNotice("");
    try {
      const saved = await api<ScadaSettings>("/scada/settings", {
        method: "PATCH",
        body: JSON.stringify(settings),
      });
      setSettings(saved);
      setSavedSettings(JSON.stringify(saved));
      setNotice(t("notice.scadaSaved"));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : t("notice.saveError"));
    } finally {
      setBusy(false);
    }
  }

  if (!settings)
    return notice ? (
      <section className="panel" role="alert">
        {notice}
      </section>
    ) : (
      <ViewSkeleton variant="form" />
    );
  const update = <K extends keyof ScadaSettings>(
    key: K,
    value: ScadaSettings[K],
  ) =>
    setSettings((current) =>
      current ? { ...current, [key]: value } : current,
    );

  return (
    <form className="panel scada-settings" onSubmit={save}>
      <header className="scada-settings-header">
        <div className="scada-settings-title">
          <p className="eyebrow">{t("scada.eyebrow")}</p>
          <h2>Connector SCADA</h2>
          <p>{t("scada.description")}</p>
        </div>
        <label className="scada-toggle">
          <input
            type="checkbox"
            checked={settings.enabled}
            onChange={(event) => update("enabled", event.target.checked)}
          />
          <span className="scada-toggle-track" aria-hidden="true">
            <i />
          </span>
          <span>{settings.enabled ? "SCADA" : t("scada.simulation")}</span>
        </label>
      </header>
      <div className="scada-settings-body">
        <div className="scada-info">
          <span aria-hidden="true">↔</span>
          <p>{t("scada.info")}</p>
        </div>
        <div className="settings-grid">
          <label>
            {t("scada.baseUrl")}
            <input
              type="url"
              value={settings.baseUrl}
              onChange={(e) => update("baseUrl", e.target.value)}
              placeholder="http://scada.local:8080"
              required={settings.enabled}
            />
            <small>{t("scada.baseUrlHelp")}</small>
          </label>
          <label>
            {t("scada.publicUrl")}
            <input
              type="url"
              value={settings.publicWebUrl}
              onChange={(e) => update("publicWebUrl", e.target.value)}
              required
            />
            <small>{t("scada.publicUrlHelp")}</small>
          </label>
          <label>
            {t("scada.routePath")}
            <input
              value={settings.routeCheckPath}
              onChange={(e) => update("routeCheckPath", e.target.value)}
              required
            />
          </label>
          <label>
            {t("scada.resultPath")}
            <input
              value={settings.submitResultPath}
              onChange={(e) => update("submitResultPath", e.target.value)}
              required
            />
          </label>
          <label>
            {t("scada.unitHistoryPath")}
            <input
              value={settings.unitHistoryPath}
              onChange={(e) => update("unitHistoryPath", e.target.value)}
              placeholder="/std_public/unithistory"
              required
            />
            <small>{t("scada.unitHistoryPathHelp")}</small>
          </label>
          <label className="timeout-field">
            {t("scada.timeout")}
            <div className="input-with-suffix">
              <input
                type="number"
                min="500"
                max="30000"
                value={settings.timeoutMs}
                onChange={(e) => update("timeoutMs", Number(e.target.value))}
                required
              />
              <span>ms</span>
            </div>
          </label>
        </div>
        {notice && <p className="notice">{notice}</p>}
      </div>
      <footer className="scada-settings-actions">
        <span>
          {settings.enabled ? t("scada.liveHelp") : t("scada.devHelp")}
        </span>
        <button className="primary" disabled={busy}>
          {busy ? t("scada.saving") : t("scada.save")}
        </button>
      </footer>
    </form>
  );
}
