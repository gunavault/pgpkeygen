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

function utcOffsetLabel(date: Date, timeZone: string): string {
  const name =
    new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "shortOffset" })
      .formatToParts(date)
      .find((part) => part.type === "timeZoneName")?.value ?? "GMT";
  // "GMT+7" -> "UTC+7", "GMT" -> "UTC"
  return name.replace(/^GMT/, "UTC");
}

/** Formats as "2026-10-05 15:43:11 UTC+7" in the given zone. */
export function formatTimestamp(date: Date, timeZone: string): string {
  const parts = Object.fromEntries(
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
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second} ${utcOffsetLabel(date, timeZone)}`;
}

export function appTimeZone(): string {
  return resolveTimeZone(process.env.APP_TIME_ZONE);
}
