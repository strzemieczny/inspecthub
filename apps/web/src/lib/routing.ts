export const APP_BASE = (import.meta.env?.BASE_URL ?? "/").replace(/\/$/, "");

export function appPath(path: string, base = APP_BASE): string {
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

export function appRoute(
  language: string,
  path: string,
  base = APP_BASE,
): string {
  return appPath(`/${language === "uk" ? "ua" : language}${path}`, base);
}

export function currentAppPath(
  pathname = window.location.pathname,
  base = APP_BASE,
): string {
  if (pathname === base) return "/";
  return base && pathname.startsWith(`${base}/`)
    ? pathname.slice(base.length)
    : pathname;
}
