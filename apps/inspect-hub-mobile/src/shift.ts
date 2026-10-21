// All station shifts follow the plant's Polish time, including DST changes.
const plantClock = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Warsaw",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function plantWallTime(date: Date): number {
  const parts = plantClock.formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return Date.UTC(
    value("year"),
    value("month") - 1,
    value("day"),
    value("hour"),
    value("minute"),
    value("second"),
  );
}

function plantInstant(wall: Date): Date {
  const target = wall.getTime();
  let instant = target;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    instant += target - plantWallTime(new Date(instant));
  }
  return new Date(instant);
}

export function currentShift(now = new Date()) {
  const wall = new Date(plantWallTime(now));
  const minutes = wall.getUTCHours() * 60 + wall.getUTCMinutes();
  const number = minutes < 375 || minutes >= 1335 ? 3 : minutes < 855 ? 1 : 2;
  if (minutes < 375) wall.setUTCDate(wall.getUTCDate() - 1);
  const hour = number === 1 ? 6 : number === 2 ? 14 : 22;
  wall.setUTCHours(hour, 15, 0, 0);
  const from = plantInstant(wall);
  wall.setUTCHours(hour + 8);
  return {
    number,
    from,
    to: plantInstant(wall),
    hours:
      number === 1
        ? "06:15–14:15"
        : number === 2
          ? "14:15–22:15"
          : "22:15–06:15",
  };
}
