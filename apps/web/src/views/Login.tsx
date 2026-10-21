import { useRef, useState, type FormEvent } from "react";
import { api, type CardLoginResult, type Session } from "../lib/api";

import { SettingsMenu, useI18n } from "../lib/i18n";
import { useUpdateGuard } from "../lib/use-update-guard";
import { appPath } from "../lib/routing";

export default function Login({
  onLogin,
}: {
  onLogin: (session: Session) => void;
}) {
  const { t } = useI18n();
  const cardInput = useRef<HTMLInputElement>(null);
  const [identifier, setIdentifier] = useState("");
  const [cardCode, setCardCode] = useState("");
  const [pairingRequired, setPairingRequired] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useUpdateGuard(
    Boolean(busy || identifier || cardCode || username || password),
  );

  async function submitCard(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = pairingRequired
        ? await api<Session>("/auth/pair-card", {
            method: "POST",
            body: JSON.stringify({ identifier, cardCode }),
          })
        : await api<CardLoginResult>("/auth/card-login", {
            method: "POST",
            body: JSON.stringify({ identifier }),
          });
      if ("requiresPairing" in result) {
        setPairingRequired(true);
        return;
      }
      onLogin(result);
    } catch (reason) {
      if (pairingRequired) setCardCode("");
      else setIdentifier("");
      setError(reason instanceof Error ? reason.message : t("login.cardError"));
      window.setTimeout(() => cardInput.current?.focus(), 0);
    } finally {
      setBusy(false);
    }
  }

  async function submitLogin(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const session = await api<Session>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      onLogin(session);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("login.error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell">
      <div className="auth-settings">
        <SettingsMenu />
      </div>
      <section className="auth-card">
        <img
          className="auth-brand-symbol"
          src={appPath("/branding/inspect-hub-symbol-192-v2.png")}
          alt=""
          width={80}
          height={80}
        />
        <p className="eyebrow">{t("common.qualityOperations")}</p>
        <h1>Inspect Hub</h1>
        <p className="muted">{t("login.tagline")}</p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <>
          <form className="card-login-form" onSubmit={submitCard}>
            <div className="card-reader-icon" aria-hidden="true">
              ▣
            </div>
            <h2>{t("login.cardTitle")}</h2>
            <p className="muted">{t("login.cardHint")}</p>
            <label className="card-identifier-label">
              {t("login.cardIdentifier")}
              <input
                ref={cardInput}
                inputMode="text"
                autoComplete="off"
                pattern="[A-Za-z0-9]+"
                maxLength={30}
                value={identifier}
                onChange={(event) =>
                  setIdentifier(
                    event.target.value
                      .replace(/[^A-Za-z0-9]/g, "")
                      .toUpperCase(),
                  )
                }
                autoFocus
                required
                readOnly={pairingRequired}
              />
            </label>
            {pairingRequired && (
              <label className="card-identifier-label">
                {t("login.cardCode")}
                <input
                  inputMode="numeric"
                  autoComplete="off"
                  pattern="[0-9]{4}"
                  maxLength={4}
                  value={cardCode}
                  onChange={(event) =>
                    setCardCode(event.target.value.replace(/\D/g, ""))
                  }
                  autoFocus
                  required
                />
                <small>{t("login.cardCodeHint")}</small>
              </label>
            )}
            <button className="primary" disabled={busy}>
              {busy ? t("login.cardBusy") : t("login.cardButton")}
            </button>
          </form>
          <details className="password-login">
            <summary>{t("login.adminLogin")}</summary>
            <form onSubmit={submitLogin}>
              <label>
                {t("login.username")}
                <input
                  type="text"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
              </label>
              <label>
                {t("login.password")}
                <input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </label>
              <button className="primary" disabled={busy}>
                {busy ? t("login.busy") : t("common.login")}
              </button>
            </form>
          </details>
          <p className="auth-note">{t("login.note")}</p>
        </>
      </section>
    </main>
  );
}
