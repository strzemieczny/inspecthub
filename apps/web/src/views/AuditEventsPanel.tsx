import { TableSkeletonRows } from "../components/ViewSkeleton";
import { Fragment, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";

import { useI18n } from "../lib/i18n";

type AuditEvent = {
  id: string;
  occurredAt: string;
  receivedAt: string;
  type: string;
  category: string;
  severity: "DEBUG" | "INFO" | "WARNING" | "ERROR" | "CRITICAL";
  outcome: "SUCCESS" | "FAILURE" | "UNKNOWN";
  source: string;
  correlationId: string;
  actorId?: string;
  actorType?: string;
  stationCode?: string;
  entityType?: string;
  entityId?: string;
  payload: Record<string, unknown>;
  payloadHash: string;
};

export default function AuditEventsPanel() {
  const { locale, t } = useI18n();
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [type, setType] = useState("");
  const [stationCode, setStationCode] = useState("");
  const [correlationId, setCorrelationId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");

  async function load() {
    setLoading(true);
    setNotice("");
    const query = new URLSearchParams({ limit: "250" });
    if (type.trim()) query.set("type", type.trim());
    if (stationCode.trim()) query.set("stationCode", stationCode.trim());
    if (correlationId.trim()) query.set("correlationId", correlationId.trim());
    if (from) query.set("from", new Date(from).toISOString());
    if (to) query.set("to", new Date(to).toISOString());
    try {
      setEvents(await api<AuditEvent[]>(`/events?${query.toString()}`));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : t("logs.loadError"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void api<AuditEvent[]>("/events?limit=250")
      .then(setEvents)
      .catch((error: Error) => setNotice(error.message))
      .finally(() => setLoading(false));
  }, []);

  function reset() {
    setType("");
    setStationCode("");
    setCorrelationId("");
    setFrom("");
    setTo("");
  }

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: "short",
        timeStyle: "medium",
      }),
    [locale],
  );

  return (
    <section className="panel audit-events">
      <form
        className="audit-filters"
        onSubmit={(event) => {
          event.preventDefault();
          void load();
        }}
      >
        <label>
          {t("logs.type")}
          <input
            value={type}
            onChange={(event) => setType(event.target.value)}
            placeholder="INSPECTION_COMPLETED"
          />
        </label>
        <label>
          {t("logs.station")}
          <input
            value={stationCode}
            onChange={(event) => setStationCode(event.target.value)}
            placeholder="ST-01"
          />
        </label>
        <label>
          Correlation ID
          <input
            value={correlationId}
            onChange={(event) => setCorrelationId(event.target.value)}
          />
        </label>
        <label>
          {t("logs.from")}
          <input
            type="datetime-local"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
          />
        </label>
        <label>
          {t("logs.to")}
          <input
            type="datetime-local"
            value={to}
            onChange={(event) => setTo(event.target.value)}
          />
        </label>
        <div className="audit-filter-actions">
          <button className="secondary" type="button" onClick={reset}>
            {t("logs.clear")}
          </button>
          <button type="submit" disabled={loading}>
            {loading ? t("common.loading") : t("logs.filter")}
          </button>
        </div>
      </form>
      {loading && (
        <span className="loading-sr-only" role="status">
          {t("common.loading")}
        </span>
      )}
      <div className="audit-table-heading">
        <span className="table-count">
          {t("logs.count", { count: events.length })}
        </span>
        <small>{t("logs.utcHint")}</small>
      </div>
      {notice && <p className="notice">{notice}</p>}
      <div className="table-scroll audit-table-scroll">
        <table>
          <thead>
            <tr>
              <th>{t("logs.time")}</th>
              <th>{t("logs.event")}</th>
              <th>{t("logs.severity")}</th>
              <th>{t("logs.outcome")}</th>
              <th>{t("logs.context")}</th>
              <th>{t("logs.details")}</th>
            </tr>
          </thead>
          <tbody>
            {loading && <TableSkeletonRows columns={6} />}
            {!loading &&
              events.map((item) => (
                <Fragment key={item.id}>
                  <tr>
                    <td>
                      <strong>
                        {dateFormatter.format(new Date(item.occurredAt))}
                      </strong>
                      <small>{item.source}</small>
                    </td>
                    <td>
                      <strong>{item.type}</strong>
                      <small>{item.category}</small>
                    </td>
                    <td>
                      <span
                        className={`audit-badge severity-${item.severity.toLowerCase()}`}
                      >
                        {item.severity}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`audit-badge outcome-${item.outcome.toLowerCase()}`}
                      >
                        {item.outcome}
                      </span>
                    </td>
                    <td>
                      <strong>
                        {item.stationCode ?? item.actorType ?? "—"}
                      </strong>
                      <small title={item.correlationId}>
                        {item.correlationId}
                      </small>
                    </td>
                    <td>
                      <button
                        className="secondary audit-details-button"
                        type="button"
                        aria-expanded={expandedId === item.id}
                        onClick={() =>
                          setExpandedId((current) =>
                            current === item.id ? null : item.id,
                          )
                        }
                      >
                        {expandedId === item.id
                          ? t("logs.hide")
                          : t("logs.show")}
                      </button>
                    </td>
                  </tr>
                  {expandedId === item.id && (
                    <tr className="audit-detail-row">
                      <td colSpan={6}>
                        <dl>
                          <div>
                            <dt>ID</dt>
                            <dd>{item.id}</dd>
                          </div>
                          <div>
                            <dt>Correlation ID</dt>
                            <dd>{item.correlationId}</dd>
                          </div>
                          <div>
                            <dt>{t("logs.entity")}</dt>
                            <dd>
                              {item.entityType && item.entityId
                                ? `${item.entityType} · ${item.entityId}`
                                : "—"}
                            </dd>
                          </div>
                          <div>
                            <dt>SHA-256</dt>
                            <dd>{item.payloadHash}</dd>
                          </div>
                        </dl>
                        <pre>{JSON.stringify(item.payload, null, 2)}</pre>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            {!loading && events.length === 0 && (
              <tr>
                <td className="audit-empty" colSpan={6}>
                  {t("logs.empty")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
