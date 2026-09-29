import Form from "next/form";
import Link from "next/link";
import { KEY_STATUS_FILTERS, dashboardHref, type KeyStatusFilter } from "@/lib/key-filter";

const STATUS_LABELS: Record<KeyStatusFilter, string> = {
  all: "All",
  active: "Active",
  revoked: "Revoked",
};

// Server component: the filter lives in the URL (?q=&status=) so it survives
// reloads, is shareable, and works without JavaScript. <Form> upgrades the
// GET submit to a client-side navigation when JS is available.
export function KeyFilter({
  query,
  status,
  shown,
  total,
}: {
  query: string;
  status: KeyStatusFilter;
  shown: number;
  total: number;
}) {
  const isFiltering = query !== "" || status !== "all";

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Form action="/dashboard" className="flex flex-1 min-w-[220px] gap-2">
        {status !== "all" && <input type="hidden" name="status" value={status} />}
        <input
          name="q"
          type="search"
          defaultValue={query}
          placeholder="Search title, name, email or fingerprint"
          aria-label="Search keys"
          className="input flex-1"
        />
        <button type="submit" className="btn btn-secondary whitespace-nowrap">
          Search
        </button>
      </Form>

      <div className="seg flex" role="group" aria-label="Filter by status">
        {KEY_STATUS_FILTERS.map((option) => {
          const active = option === status;
          return (
            <Link
              key={option}
              href={dashboardHref(query, option)}
              aria-current={active ? "true" : undefined}
              className="seg-opt"
              style={{
                textDecoration: "none",
                background: active ? "var(--color-accent)" : "transparent",
                color: active ? "var(--color-bg)" : "var(--color-text)",
              }}
            >
              {STATUS_LABELS[option]}
            </Link>
          );
        })}
      </div>

      <span className="text-xs text-muted whitespace-nowrap">
        {shown} of {total} {total === 1 ? "key" : "keys"}
      </span>
      {isFiltering && (
        <Link href="/dashboard" className="lnk text-xs">
          Clear
        </Link>
      )}
    </div>
  );
}
