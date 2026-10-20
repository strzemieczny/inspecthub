export function dashboardDate(daysAgo: number, now = new Date()): string {
  const date = new Date(now);
  date.setDate(date.getDate() - daysAgo);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

export function validDashboardRange(from: string, to: string): boolean {
  const validDate = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T12:00:00`);
    return !Number.isNaN(date.getTime()) && dashboardDate(0, date) === value;
  };
  return validDate(from) && validDate(to) && from <= to;
}

export function dashboardQuery(selected: {
  from: string;
  to: string;
  [key: string]: string | string[];
}): URLSearchParams {
  if (!validDashboardRange(selected.from, selected.to)) {
    throw new Error(
      "Wybierz prawidłowy zakres dat: Od nie może być później niż Do.",
    );
  }
  const query = new URLSearchParams({
    from: new Date(`${selected.from}T00:00:00`).toISOString(),
    to: new Date(`${selected.to}T23:59:59.999`).toISOString(),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
  Object.entries(selected).forEach(([key, value]) => {
    if (key === "from" || key === "to") return;
    if (Array.isArray(value) && value.length) query.set(key, value.join(","));
    else if (typeof value === "string" && value) query.set(key, value);
  });
  return query;
}
