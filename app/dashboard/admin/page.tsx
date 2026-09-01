import { desc } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/db/schema";

export default async function AdminAuditLogPage() {
  const session = await auth();
  if (session?.user?.role !== "admin") {
    return (
      <div className="flex flex-col gap-2">
        <h2>Access denied</h2>
        <p className="text-sm text-muted">
          You don&apos;t have permission to view this page.
        </p>
      </div>
    );
  }

  const entries = await db.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(200);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-end justify-between">
        <div>
          <div
            style={{ fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--color-neutral-600)", marginBottom: 6 }}
          >
            Admin
          </div>
          <h1 className="text-3xl m-0">Audit log</h1>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted">
          <span className="tag tag-neutral">{entries.length} entries</span>
          <span>Last 200 events</span>
        </div>
      </div>

      {entries.length === 0 && <p className="text-sm text-muted">No audit entries yet.</p>}

      {entries.length > 0 && (
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 180 }}>Time</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Target</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td className="mono text-muted whitespace-nowrap text-xs">
                    {entry.createdAt.toLocaleString()}
                  </td>
                  <td className="text-[13px]">{entry.actorEmail}</td>
                  <td>
                    <span className="tag tag-accent" style={{ fontSize: 10 }}>
                      {entry.action}
                    </span>
                  </td>
                  <td className="mono text-muted text-xs">{entry.target ?? "—"}</td>
                  <td className="text-muted text-[12.5px]">{entry.details ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
