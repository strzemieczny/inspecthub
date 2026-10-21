import type { SessionUser } from "../lib/api";
import { useI18n } from "../lib/i18n";

type AdminSection =
  | "forms-new"
  | "forms-edit"
  | "stations"
  | "users"
  | "settings"
  | "logs";

function AdminMenuIcon({
  type,
}: {
  type: "forms" | "stations" | "users" | "settings" | "logs";
}) {
  if (type === "forms") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9 5.5h9M9 12h9M9 18.5h9" />
        <path d="m3.5 5.5 1.2 1.2 2.1-2.4M3.5 12l1.2 1.2 2.1-2.4M3.5 18.5l1.2 1.2 2.1-2.4" />
      </svg>
    );
  }
  if (type === "stations")
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 20V8.5L9 5v15M9 10h11v10M2.5 20h19" />
        <path d="M12.5 13.5h1M17 13.5h1M12.5 17h1M17 17h1M6.5 10.5h.01M6.5 14h.01" />
      </svg>
    );
  if (type === "users")
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M16 20v-1.5a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4V20M9 10.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
        <path d="M17 8v6M14 11h6" />
      </svg>
    );
  if (type === "logs")
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 5.5h16M4 12h16M4 18.5h16" />
        <path d="M7 3v5M12 9.5v5M17 16v5" />
      </svg>
    );
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z" />
      <path d="M19 12a7 7 0 0 0-.1-1l2-1.6-2-3.4-2.5 1A8 8 0 0 0 14.7 6L14.3 3h-4.6l-.4 3A8 8 0 0 0 7.6 7L5.1 6l-2 3.4L5.1 11a7 7 0 0 0 0 2l-2 1.6 2 3.4 2.5-1a8 8 0 0 0 1.7 1l.4 3h4.6l.4-3a8 8 0 0 0 1.7-1l2.5 1 2-3.4-2-1.6a7 7 0 0 0 .1-1Z" />
    </svg>
  );
}

export function AdminSidebar({
  role,
  section,
  sidebarCollapsed,
  onToggle,
  onNewForm,
  onSectionChange,
}: {
  role: SessionUser["role"];
  section: AdminSection;
  sidebarCollapsed: boolean;
  onToggle?: () => void;
  onNewForm?: () => void;
  onSectionChange?: (section: AdminSection) => void;
}) {
  const { t } = useI18n();
  const canManageScada = role === "ADMIN";
  return (
    <aside className="admin-sidebar">
      <div className="admin-sidebar-header">
        <div className="admin-sidebar-title">
          <span>{role}</span>
          <strong>{t("admin.management")}</strong>
        </div>
        <button
          className="sidebar-toggle"
          type="button"
          onClick={onToggle}
          aria-label={
            sidebarCollapsed ? t("admin.expand") : t("admin.collapse")
          }
          title={sidebarCollapsed ? t("admin.expand") : t("admin.collapse")}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d={sidebarCollapsed ? "m9 5 7 7-7 7" : "m15 5-7 7 7 7"} />
          </svg>
        </button>
      </div>
      <nav className="admin-menu" aria-label={t("admin.sections")}>
        <div className="admin-menu-group">
          <button
            className={section.startsWith("forms-") ? "active" : ""}
            type="button"
            onClick={onNewForm}
            title={sidebarCollapsed ? t("admin.forms") : undefined}
          >
            <i>
              <AdminMenuIcon type="forms" />
            </i>
            <span>
              {t("admin.forms")}
              <small>{t("admin.formsSubtitle")}</small>
            </span>
          </button>
          <div
            className={
              section.startsWith("forms-")
                ? "admin-submenu expanded"
                : "admin-submenu"
            }
            aria-hidden={!section.startsWith("forms-")}
          >
            <button
              className={section === "forms-new" ? "active" : ""}
              type="button"
              onClick={onNewForm}
              title={sidebarCollapsed ? t("admin.newForm") : undefined}
            >
              <i aria-hidden="true">＋</i>
              <span>{t("admin.newForm")}</span>
            </button>
            <button
              className={section === "forms-edit" ? "active" : ""}
              type="button"
              onClick={() => onSectionChange?.("forms-edit")}
              title={sidebarCollapsed ? t("admin.editForms") : undefined}
            >
              <i aria-hidden="true">✎</i>
              <span>{t("admin.editForms")}</span>
            </button>
          </div>
        </div>
        <button
          className={section === "stations" ? "active" : ""}
          type="button"
          onClick={() => onSectionChange?.("stations")}
          title={sidebarCollapsed ? t("admin.stations") : undefined}
        >
          <i>
            <AdminMenuIcon type="stations" />
          </i>
          <span>
            {t("admin.stations")}
            <small>{t("admin.stationsSubtitle")}</small>
          </span>
        </button>
        <button
          className={section === "users" ? "active" : ""}
          type="button"
          onClick={() => onSectionChange?.("users")}
          title={sidebarCollapsed ? t("admin.users") : undefined}
        >
          <i>
            <AdminMenuIcon type="users" />
          </i>
          <span>
            {t("admin.users")}
            <small>{t("admin.usersSubtitle")}</small>
          </span>
        </button>
        <button
          className={section === "logs" ? "active" : ""}
          type="button"
          onClick={() => onSectionChange?.("logs")}
          title={sidebarCollapsed ? t("admin.logs") : undefined}
        >
          <i>
            <AdminMenuIcon type="logs" />
          </i>
          <span>
            {t("admin.logs")}
            <small>{t("admin.logsSubtitle")}</small>
          </span>
        </button>
        {canManageScada && (
          <button
            className={section === "settings" ? "active" : ""}
            type="button"
            onClick={() => onSectionChange?.("settings")}
            title={sidebarCollapsed ? t("admin.scada") : undefined}
          >
            <i>
              <AdminMenuIcon type="settings" />
            </i>
            <span>
              {t("admin.scada")}
              <small>{t("admin.scadaSubtitle")}</small>
            </span>
          </button>
        )}
      </nav>
    </aside>
  );
}
