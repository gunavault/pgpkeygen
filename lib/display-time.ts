// Timestamps are stored in UTC (timestamptz). This only decides how they are
// shown to people. APP_TIME_ZONE takes an IANA zone name; the default is
// Asia/Jakarta (UTC+7).
export const DEFAULT_TIME_ZONE = "Asia/Jakarta";

export function resolveTimeZone(configured: string | undefined): string {
  const candidate = configured?.trim() || DEFAULT_TIME_ZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate });
    return candidate;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

function wallClockParts(date: Date, timeZone: string): Record<string, string> {
  return Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
}

// Computed from the wall clock rather than read from the ICU zone name, whose
// spelling ("GMT", "GMT+0", ...) differs between Node.js builds.
function utcOffsetLabel(date: Date, parts: Record<string, string>): string {
  const wallAsUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  const offsetMinutes = Math.round((wallAsUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
  if (offsetMinutes === 0) return "UTC";
  const sign = offsetMinutes > 0 ? "+" : "-";
  const hours = Math.floor(Math.abs(offsetMinutes) / 60);
  const minutes = Math.abs(offsetMinutes) % 60;
  return `UTC${sign}${hours}${minutes ? `:${String(minutes).padStart(2, "0")}` : ""}`;
}

/** Formats as "2026-10-05 15:43:11 UTC+7" in the given zone. */
export function formatTimestamp(date: Date, timeZone: string): string {
  const parts = wallClockParts(date, timeZone);
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second} ${utcOffsetLabel(date, parts)}`;
}

export function appTimeZone(): string {
  return resolveTimeZone(process.env.APP_TIME_ZONE);
}
