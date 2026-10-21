import { TableSkeletonRows } from "../components/ViewSkeleton";
import { useEffect, useState } from "react";
import { api, type SessionUser } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { CompactSelect } from "./CompactSelect";
import "./UsersManager.css";

interface ManagedUser extends SessionUser {
  externalProvider: string | null;
  createdAt: string;
}

export function UsersManager() {
  const { locale, t } = useI18n();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");

  useEffect(() => {
    let active = true;
    void api<ManagedUser[]>("/users")
      .then((data) => {
        if (active) setUsers(data);
      })
      .catch((reason: Error) => {
        if (active) setNotice(reason.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const query = search.trim().toLocaleLowerCase();
  const visibleUsers = users.filter(
    (user) =>
      (!role || user.role === role) &&
      `${user.name} ${user.email}`.toLocaleLowerCase().includes(query),
  );

  return (
    <section className="panel users-directory">
      <div className="users-directory-heading">
        <div>
          <h2>{t("admin.users")}</h2>
          <p className="muted">{t("users.directoryHint")}</p>
        </div>
        <span className="table-count">
          {t("users.count", { count: users.length })}
        </span>
      </div>
      <div className="users-directory-toolbar">
        <div className="users-directory-search">
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <circle cx="8.5" cy="8.5" r="5.5" />
            <path d="m13 13 4 4" />
          </svg>
          <input
            type="search"
            aria-label={t("users.search")}
            placeholder={t("users.search")}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <CompactSelect
          label={t("users.role")}
          value={role}
          onChange={setRole}
          options={[
            { value: "", label: t("users.allRoles") },
            { value: "ADMIN", label: t("users.admin") },
            { value: "MANAGER", label: t("users.manager") },
            { value: "OPERATOR", label: t("users.operator") },
          ]}
        />
      </div>
      <div
        className="users-directory-scroll"
        role="region"
        aria-label={t("admin.users")}
        tabIndex={0}
      >
        <table className="users-directory-table" aria-busy={loading}>
          <colgroup>
            <col />
            <col className="users-directory-role-col" />
            <col className="users-directory-source-col" />
            <col className="users-directory-date-col" />
          </colgroup>
          <thead>
            <tr>
              <th scope="col">{t("users.identity")}</th>
              <th scope="col">{t("users.role")}</th>
              <th scope="col">{t("users.source")}</th>
              <th scope="col">{t("users.created")}</th>
            </tr>
          </thead>
          <tbody>
            {loading && <TableSkeletonRows columns={4} />}
            {!loading &&
              visibleUsers.map((user) => (
                <tr key={user.id}>
                  <td>
                    <div className="users-directory-person">
                      <span
                        className="users-directory-avatar"
                        aria-hidden="true"
                      >
                        {user.name
                          .trim()
                          .split(/\s+/)
                          .slice(0, 2)
                          .map((part) => part[0])
                          .join("")
                          .toLocaleUpperCase()}
                      </span>
                      <div>
                        <strong title={user.name}>{user.name}</strong>
                        <span title={user.email}>{user.email}</span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span
                      className={`users-directory-role role-${user.role.toLowerCase()}`}
                    >
                      {t(
                        user.role === "ADMIN"
                          ? "users.admin"
                          : user.role === "MANAGER"
                            ? "users.manager"
                            : "users.operator",
                      )}
                    </span>
                  </td>
                  <td>
                    <span className="users-directory-source">
                      {user.externalProvider === "LDAP"
                        ? "Active Directory"
                        : user.externalProvider === "APACS"
                          ? "APACS"
                          : t("users.local")}
                    </span>
                    {!user.externalProvider && (
                      <small>{t("users.signInDisabled")}</small>
                    )}
                  </td>
                  <td>
                    <time dateTime={user.createdAt}>
                      {new Intl.DateTimeFormat(locale).format(
                        new Date(user.createdAt),
                      )}
                    </time>
                  </td>
                </tr>
              ))}
            {!loading && !visibleUsers.length && (
              <tr>
                <td colSpan={4} className="users-directory-empty">
                  {notice || t("users.empty")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {loading && (
        <span className="loading-sr-only" role="status">
          {t("common.loading")}
        </span>
      )}
      <div className="users-directory-footer" aria-live="polite">
        {t("stations.range", {
          from: visibleUsers.length ? 1 : 0,
          to: visibleUsers.length,
          count: users.length,
        })}
      </div>
      {notice && users.length > 0 && (
        <p className="notice" role="alert">
          {notice}
        </p>
      )}
    </section>
  );
}
