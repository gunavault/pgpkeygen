import { count, desc, eq, sql } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { pgpKeys, users } from "@/lib/db/schema";
import { appTimeZone, formatTimestamp } from "@/lib/display-time";
import { AllowResetButton } from "./AllowResetButton";
import { UserApprovalButtons } from "./UserApprovalButtons";

const STATUS_TAG: Record<string, string> = {
  pending: "tag tag-accent",
  active: "tag tag-neutral",
  rejected: "tag",
};

export default async function AdminUsersPage() {
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

  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      role: users.role,
      status: users.status,
      createdAt: users.createdAt,
      recoveryCreatedAt: users.recoveryCreatedAt,
      keyCount: count(pgpKeys.id),
    })
    .from(users)
    .leftJoin(pgpKeys, eq(pgpKeys.userId, users.id))
    .groupBy(users.id)
    .orderBy(sql`case when ${users.status} = 'pending' then 0 else 1 end`, desc(users.createdAt));

  const timeZone = appTimeZone();
  const pending = rows.filter((row) => row.status === "pending").length;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-end justify-between">
        <div>
          <div
            style={{ fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--color-neutral-600)", marginBottom: 6 }}
          >
            Admin
          </div>
          <h1 className="text-3xl m-0">Users</h1>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted">
          <span className="tag tag-neutral">{rows.length} accounts</span>
          {pending > 0 && <span className="tag tag-accent">{pending} awaiting approval</span>}
        </div>
      </div>

      <p className="text-sm text-muted m-0">
        New accounts cannot sign in until approved. Rejected accounts stay blocked and can be approved later.
      </p>

      <div className="overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th style={{ width: 200 }}>Registered ({timeZone})</th>
              <th>Keys</th>
              <th>Recovery code</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="text-[13px]">{row.email}</td>
                <td className="text-xs">{row.role}</td>
                <td>
                  <span className={STATUS_TAG[row.status] ?? "tag"} style={{ fontSize: 10 }}>
                    {row.status}
                  </span>
                </td>
                <td className="mono text-muted whitespace-nowrap text-xs">
                  {formatTimestamp(row.createdAt, timeZone)}
                </td>
                <td className="mono text-xs">{row.keyCount}</td>
                <td className="text-xs">{row.recoveryCreatedAt ? "yes" : "no"}</td>
                <td className="whitespace-nowrap">
                  {row.id !== session.user.id && row.status !== "active" && (
                    <UserApprovalButtons userId={row.id} email={row.email} status={row.status} />
                  )}
                  {row.id !== session.user.id && row.status === "active" && (
                    <AllowResetButton userId={row.id} email={row.email} hasRecoveryCode={row.recoveryCreatedAt !== null} />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
