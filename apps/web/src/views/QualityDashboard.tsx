import { ViewSkeleton } from "../components/ViewSkeleton";
import { useEffect, useState } from "react";
import { api, qualityWebSocketUrl } from "../lib/api";

import { useI18n } from "../lib/i18n";
import { appPath, appRoute } from "../lib/routing";

type QualityDashboardData = {
  generatedAt: string;
  windowHours: number;
  summary: {
    inspections: number;
    nok: number;
    activeNokStreaks: number;
    criticalDefects: number;
  };
  nokStreaks: Array<{
    stationCode: string;
    formCode: string;
    formName: string;
    count: number;
    threshold: number;
    latestAt: string;
    reportId: string;
  }>;
  criticalDefects: Array<{
    inspectionId: string;
    reportId: string;
    serialNumber: string;
    stationCode: string;
    formCode: string;
    questionId: string;
    questionLabel: string;
    occurredAt: string;
  }>;
};

export default function QualityDashboard() {
  const { language, locale, t } = useI18n();
  const route = (path: string) => appRoute(language, path);
  const [data, setData] = useState<QualityDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [connection, setConnection] = useState<
    "connecting" | "live" | "offline"
  >("connecting");

  useEffect(() => {
    let active = true;
    let socket: WebSocket | null = null;
    let reconnectTimer = 0;
    const refresh = () =>
      api<QualityDashboardData>("/inspections/quality-dashboard")
        .then((result) => active && setData(result))
        .catch(() => active && setConnection("offline"))
        .finally(() => active && setLoading(false));
    const connect = () => {
      if (!active) return;
      setConnection("connecting");
      socket = new WebSocket(qualityWebSocketUrl());
      socket.addEventListener("open", () => {
        setConnection("live");
        void refresh();
      });
      socket.addEventListener("message", () => void refresh());
      socket.addEventListener("close", () => {
        if (!active) return;
        setConnection("offline");
        reconnectTimer = window.setTimeout(connect, 3000);
      });
      socket.addEventListener("error", () => socket?.close());
    };
    void refresh();
    connect();
    return () => {
      active = false;
      window.clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, []);

  const time = (value: string) =>
    new Intl.DateTimeFormat(locale, {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(new Date(value));

  return (
    <main className="quality-live-shell">
      <header className="quality-live-nav">
        <a className="brand dashboard-brand" href={route("/")}>
          <span className="brand-icon">
            <img
              className="brand-symbol"
              src={appPath("/branding/inspect-hub-symbol-192-v2.png")}
              alt=""
              width={36}
              height={36}
            />
          </span>
          <div>
            Inspect Hub<small>QUALITY LIVE</small>
          </div>
        </a>
        <div className={`quality-connection ${connection}`}>
          <i />{" "}
          {connection === "live"
            ? "NA ŻYWO"
            : connection === "connecting"
              ? "ŁĄCZENIE…"
              : "BRAK POŁĄCZENIA"}
        </div>
      </header>
      <div className="quality-live-content">
        <section className="quality-live-heading">
          <div>
            <p className="eyebrow">MONITOR JAKOŚCI · OSTATNIE 24 GODZINY</p>
            <h1>Alerty jakościowe</h1>
            <p>
              Serie kolejnych wyników NOK i krytyczne niezgodności z inspekcji.
            </p>
          </div>
          <a href={route("/")}>← Dashboard wyników</a>
        </section>

        {!data ? (
          loading ? (
            <ViewSkeleton variant="quality" />
          ) : (
            <p className="notice" role="alert">
              {t("dashboard.apiError")}
            </p>
          )
        ) : (
          <>
            <section className="quality-live-kpis">
              <article>
                <span>Inspekcje</span>
                <strong>{data?.summary.inspections ?? "—"}</strong>
              </article>
              <article>
                <span>Wyniki NOK</span>
                <strong>{data?.summary.nok ?? "—"}</strong>
              </article>
              <article className="warning">
                <span>Aktywne serie NOK</span>
                <strong>{data?.summary.activeNokStreaks ?? "—"}</strong>
              </article>
              <article className="critical">
                <span>Wady krytyczne</span>
                <strong>{data?.summary.criticalDefects ?? "—"}</strong>
              </article>
            </section>

            <section className="quality-live-grid">
              <article className="quality-feed-panel">
                <header>
                  <div>
                    <span className="feed-icon warning">↯</span>
                    <h2>Serie NOK</h2>
                  </div>
                  <small>próg ustawiany w formularzu</small>
                </header>
                <div className="quality-feed">
                  {data?.nokStreaks.map((item) => (
                    <a
                      href={route(`/reports/${item.reportId}`)}
                      className="feed-row urgent"
                      key={`${item.stationCode}-${item.formCode}`}
                    >
                      <span className="streak-count">
                        {item.count}
                        <small>× NOK</small>
                      </span>
                      <div>
                        <strong>{item.stationCode}</strong>
                        <p>
                          {item.formName} · {item.formCode} · próg{" "}
                          {item.threshold}
                        </p>
                      </div>
                      <time>{time(item.latestAt)}</time>
                    </a>
                  ))}
                  {!data?.nokStreaks.length && (
                    <p className="quality-empty">Brak aktywnych serii NOK.</p>
                  )}
                </div>
              </article>

              <article className="quality-feed-panel critical-panel">
                <header>
                  <div>
                    <span className="feed-icon critical">!</span>
                    <h2>Wady krytyczne</h2>
                  </div>
                  <small>odpowiedzi NOK na cechach krytycznych</small>
                </header>
                <div className="quality-feed">
                  {data?.criticalDefects.map((item) => (
                    <a
                      href={route(`/reports/${item.reportId}`)}
                      className="feed-row critical-row"
                      key={`${item.inspectionId}-${item.questionId}`}
                    >
                      <span className="critical-mark">!</span>
                      <div>
                        <strong>{item.questionLabel}</strong>
                        <p>
                          {item.stationCode} · {item.formCode} ·{" "}
                          {item.serialNumber}
                        </p>
                      </div>
                      <time>{time(item.occurredAt)}</time>
                    </a>
                  ))}
                  {!data?.criticalDefects.length && (
                    <p className="quality-empty">Brak wad krytycznych.</p>
                  )}
                </div>
              </article>
            </section>
          </>
        )}
        <footer className="quality-live-footer">
          Ostatnie przeliczenie: {data ? time(data.generatedAt) : "—"} · dane
          odświeżane po każdej zapisanej inspekcji
        </footer>
      </div>
    </main>
  );
}
