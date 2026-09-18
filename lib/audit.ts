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
  | "revocation.forgotten"
  | "password.changed";

export type AuditEntry = {
  actorEmail: string;
  action: AuditAction;
  target?: string;
  details?: string;
};

export type AuditWriter = {
  write: (entry: AuditEntry) => Promise<void>;
};

const databaseAuditWriter: AuditWriter = {
  async write(entry) {
    await db.insert(auditLog).values(entry);
  },
};

export async function logAudit(
  actorEmail: string,
  action: AuditAction,
  target?: string,
  details?: string,
  writer: AuditWriter = databaseAuditWriter,
) {
  await writer.write({ actorEmail, action, target, details });
}
