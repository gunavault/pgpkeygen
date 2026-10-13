import { db } from "./db/index.ts";
import { auditLog } from "./db/schema.ts";

export type AuditAction =
  | "user.registered"
  | "user.approved"
  | "user.rejected"
  | "login.success"
  | "login.failed"
  | "login.blocked"
  | "key.generated"
  | "key.imported"
  | "key.revoked"
  | "key.deleted"
  | "recovery.accessed"
  | "recovery.enabled"
  | "revocation.exported"
  | "revocation.forgotten"
  | "recovery_code.created"
  | "password.reset_issued"
  | "password.reset"
  | "password.reset_forced"
  | "password.reset_failed"
  | "password.changed"
  | "password.change_failed"
  | "session.invalidated";

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
