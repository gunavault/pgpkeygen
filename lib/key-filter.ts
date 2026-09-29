// Pure helpers behind the dashboard's key search/status filter. Kept free of
// Next.js and DB imports so they can be unit-tested with `node --test`.

export const KEY_STATUS_FILTERS = ["all", "active", "revoked"] as const;
export type KeyStatusFilter = (typeof KEY_STATUS_FILTERS)[number];

// The fields the text search looks at. A subset of the pgp_keys row, so the
// full row type from drizzle satisfies it without mapping.
export interface FilterableKey {
  title: string;
  name: string;
  email: string;
  fingerprint: string;
  details: string | null;
  revokedAt: Date | null;
}

type SearchParamValue = string | string[] | undefined;

function first(value: SearchParamValue): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

// Collapses a raw `?q=` value into the string the filter actually matches on.
export function normalizeQuery(value: SearchParamValue): string {
  return first(value).trim();
}

// Unknown or missing values fall back to "all" so a hand-edited URL never 500s.
export function parseKeyStatusFilter(value: SearchParamValue): KeyStatusFilter {
  const candidate = first(value).toLowerCase();
  return (KEY_STATUS_FILTERS as readonly string[]).includes(candidate)
    ? (candidate as KeyStatusFilter)
    : "all";
}

function matchesStatus(key: FilterableKey, status: KeyStatusFilter): boolean {
  if (status === "active") return key.revokedAt === null;
  if (status === "revoked") return key.revokedAt !== null;
  return true;
}

function matchesQuery(key: FilterableKey, query: string): boolean {
  if (!query) return true;
  const needle = query.toLowerCase();
  const textFields = [key.title, key.name, key.email, key.details ?? ""];
  if (textFields.some((field) => field.toLowerCase().includes(needle))) return true;

  // Fingerprints are displayed in 4-char groups ("ABCD EF01 …"), so a value
  // pasted from the UI carries spaces the stored hex string does not.
  const compactNeedle = needle.replace(/\s+/g, "");
  return compactNeedle.length > 0 && key.fingerprint.toLowerCase().includes(compactNeedle);
}

export function filterKeys<T extends FilterableKey>(
  keys: T[],
  { query = "", status = "all" }: { query?: string; status?: KeyStatusFilter },
): T[] {
  const normalized = query.trim();
  return keys.filter((key) => matchesStatus(key, status) && matchesQuery(key, normalized));
}

// Builds the dashboard URL for a filter state, omitting params at their defaults
// so the unfiltered view is always the plain `/dashboard`.
export function dashboardHref(query: string, status: KeyStatusFilter): string {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (status !== "all") params.set("status", status);
  const qs = params.toString();
  return qs ? `/dashboard?${qs}` : "/dashboard";
}
