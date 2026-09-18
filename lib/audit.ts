import { db } from "@/lib/db";
import { auditLog } from "@/lib/db/schema";

export type AuditAction =
  | "user.registered"
  | "login.success"
  | "login.failed"
  | "key.generated"
  | "key.revoked"
  | "key.deleted"
  | "recovery.accessed"
  | "recovery.enabled"
  | "revocation.exported"
  | "revocation.forgotten";

export async function logAudit(
  actorEmail: string,
  action: AuditAction,
  target?: string,
  details?: string,
) {
  await db.insert(auditLog).values({ actorEmail, action, target, details });
}
