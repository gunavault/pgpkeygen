import { desc } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/db/schema";

export default async function AdminAuditLogPage() {
  const session = await auth();
  if (session?.user?.role !== "admin") {
    return (
      <div className="flex flex-col gap-2">
        <h2 className="font-semibold">Access denied</h2>
        <p className="text-sm text-zinc-500">
          You don&apos;t have permission to view this page.
        </p>
      </div>
    );
  }

  const entries = await db.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(200);

  return (
    <div className="flex flex-col gap-3">
      <h2 className="font-semibold">Audit log</h2>

      {entries.length === 0 && <p className="text-sm text-zinc-500">No audit entries yet.</p>}

      {entries.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-zinc-500">
                <th className="pr-4 py-1">Time</th>
                <th className="pr-4 py-1">Actor</th>
                <th className="pr-4 py-1">Action</th>
                <th className="pr-4 py-1">Target</th>
                <th className="pr-4 py-1">Details</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} className="border-t">
                  <td className="pr-4 py-1 whitespace-nowrap">
                    {entry.createdAt.toLocaleString()}
                  </td>
                  <td className="pr-4 py-1">{entry.actorEmail}</td>
                  <td className="pr-4 py-1">{entry.action}</td>
                  <td className="pr-4 py-1">{entry.target ?? "—"}</td>
                  <td className="pr-4 py-1">{entry.details ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
