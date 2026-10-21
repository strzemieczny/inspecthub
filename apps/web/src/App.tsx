import { lazy, Suspense, useEffect, useSyncExternalStore } from "react";
import "./App.css";
import { AUTH_UNAUTHORIZED_EVENT, type Session } from "./lib/api";
import { SettingsMenu, useI18n } from "./lib/i18n";
import { appPath, appRoute, currentAppPath } from "./lib/routing";
import {
  clearSession,
  readStoredUser,
  saveSession,
  subscribeToSession,
} from "./lib/session";

import { ViewSkeleton } from "./components/ViewSkeleton";

const Dashboard = lazy(() => import("./views/Dashboard"));
const Login = lazy(() => import("./views/Login"));
const AdminPanel = lazy(() => import("./views/AdminPanel"));
const OperatorPanel = lazy(() => import("./views/OperatorPanel"));
const PublicReport = lazy(() => import("./views/PublicReport"));
const QualityDashboard = lazy(() => import("./views/QualityDashboard"));

function AppRoutes() {
  const { language, t } = useI18n();
  const user = useSyncExternalStore(subscribeToSession, readStoredUser);

  const route = (path: string) => appRoute(language, path);
  const originalPath = currentAppPath();
  const routeMatch = originalPath.match(/^\/(pl|en|ua)(\/.*)?$/);
  if (!routeMatch) {
    window.history.replaceState(
      {},
      "",
      `${route(originalPath === "/" ? "/" : originalPath)}${window.location.search}${window.location.hash}`,
    );
  }
  let path = routeMatch?.[2] || originalPath;
  const pageTitleKey =
    path === "/"
      ? "pageTitle.dashboard"
      : path === "/quality"
        ? "pageTitle.quality"
        : /^\/reports\/[^/]+\/?$/.test(path)
          ? "pageTitle.report"
          : path === "/inspection"
            ? "pageTitle.inspection"
            : !user
              ? "pageTitle.login"
              : "pageTitle.admin";
  const pageTitle = `Inspect Hub · ${t(pageTitleKey)}`;

  useEffect(() => {
    document.title = pageTitle;
  }, [pageTitle]);

  useEffect(() => {
    const handleUnauthorized = () => {
      clearSession();
      window.history.replaceState({}, "", appRoute(language, "/login"));
    };
    window.addEventListener(AUTH_UNAUTHORIZED_EVENT, handleUnauthorized);
    return () =>
      window.removeEventListener(AUTH_UNAUTHORIZED_EVENT, handleUnauthorized);
  }, [language]);

  if (path === "/") return <Dashboard />;
  if (path === "/quality") return <QualityDashboard />;
  const publicReportMatch = path.match(/^\/reports\/([^/]+)\/?$/);
  if (publicReportMatch) {
    return (
      <PublicReport publicReportId={decodeURIComponent(publicReportMatch[1])} />
    );
  }
  if (path === "/inspection") {
    return (
      <OperatorPanel
        key={user?.id ?? "anonymous"}
        user={user}
        onLogin={loginUser}
        onLogout={user ? logoutUser : undefined}
      />
    );
  }
  if (!user) {
    if (path !== "/login") {
      window.history.replaceState({}, "", route("/login"));
    }
    return <Login onLogin={loginUser} />;
  }

  function loginUser(session: Session) {
    saveSession(session);
    window.history.replaceState(
      {},
      "",
      route(session.user.role === "OPERATOR" ? "/inspection" : "/admin"),
    );
  }

  function logoutUser() {
    clearSession();
    window.history.replaceState({}, "", route("/login"));
  }

  if (user.role === "OPERATOR" && path !== "/inspection") {
    window.history.replaceState({}, "", route("/inspection"));
    return (
      <OperatorPanel
        key={user.id}
        user={user}
        onLogin={loginUser}
        onLogout={logoutUser}
      />
    );
  } else if (path === "/login") {
    window.history.replaceState({}, "", route("/admin"));
    path = "/admin";
  }

  if (path !== "/admin") {
    window.history.replaceState({}, "", route("/admin"));
  }

  return (
    <>
      <nav className="admin-topbar">
        <a className="brand" href={route("/admin")}>
          <span className="brand-icon">
            <img
              className="brand-symbol"
              src={appPath("/branding/inspect-hub-symbol-192-v2.png")}
              alt=""
              width={36}
              height={36}
            />
          </span>{" "}
          Inspect Hub
        </a>
        <div className="nav-actions">
          <a className="home-link" href={route("/")}>
            {t("nav.home")}
          </a>
          <a className="station-link" href={route("/inspection")}>
            {t("nav.openStation")}
          </a>
          <div className="admin-account" title={user.name}>
            <span className="admin-account-avatar" aria-hidden="true">
              {user.name
                .trim()
                .split(/\s+/)
                .slice(0, 2)
                .map((part) => part[0])
                .join("")
                .toUpperCase()}
            </span>
            <span className="admin-account-copy">
              <strong>{user.name}</strong>
              <small>{user.role}</small>
            </span>
          </div>
          <button className="ghost admin-logout" onClick={logoutUser}>
            {t("common.logout")}
          </button>
          <SettingsMenu />
        </div>
      </nav>
      <AdminPanel key={`${user.id}-${user.role}`} role={user.role} />
    </>
  );
}

export default function App() {
  const path = currentAppPath().replace(/^\/(pl|en|ua)(?=\/|$)/, "") || "/";
  const variant =
    path === "/"
      ? "dashboard"
      : path === "/quality"
        ? "quality"
        : path.startsWith("/reports/")
          ? "report"
          : path === "/inspection"
            ? "inspection"
            : path === "/login"
              ? "login"
              : "form";
  return (
    <Suspense fallback={<ViewSkeleton variant={variant} page />}>
      <AppRoutes />
    </Suspense>
  );
}
