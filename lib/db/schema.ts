import { sql } from "drizzle-orm";
import { check, integer, pgTable, uuid, varchar, text, timestamp } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: varchar("role", { length: 20 }).notNull().default("user"),
  // pending until an administrator approves the account. The default is the
  // locked state so an insert that forgets to set it cannot create an open
  // account; migration 0007 marked every pre-existing account active.
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  sessionsValidAfter: timestamp("sessions_valid_after", { withTimezone: true }),
  // Client-created random vault key, wrapped under a password-derived KEK.
  // All fields remain nullable so existing accounts and users who never opt in
  // have no escrow state at all.
  vaultWrappedKey: text("vault_wrapped_key"),
  vaultKdfSalt: varchar("vault_kdf_salt", { length: 64 }),
  vaultKdfIv: varchar("vault_kdf_iv", { length: 64 }),
  vaultKdfIterations: integer("vault_kdf_iterations"),
  vaultWrapVersion: integer("vault_wrap_version"),
  // The same vault key wrapped a second time, under a recovery code only the
  // user holds. The server keeps a hash of a verifier derived from the code,
  // never the code. All seven columns are set together or not at all.
  recoveryWrappedKey: text("recovery_wrapped_key"),
  recoveryKdfSalt: varchar("recovery_kdf_salt", { length: 64 }),
  recoveryKdfIv: varchar("recovery_kdf_iv", { length: 64 }),
  recoveryKdfIterations: integer("recovery_kdf_iterations"),
  recoveryWrapVersion: integer("recovery_wrap_version"),
  recoveryVerifierHash: varchar("recovery_verifier_hash", { length: 64 }),
  recoveryCreatedAt: timestamp("recovery_created_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check("users_status_check", sql`${table.status} in ('pending', 'active', 'rejected')`),
  check(
    "users_recovery_all_or_nothing",
    sql`num_nulls(${table.recoveryWrappedKey}, ${table.recoveryKdfSalt}, ${table.recoveryKdfIv}, ${table.recoveryKdfIterations}, ${table.recoveryWrapVersion}, ${table.recoveryVerifierHash}, ${table.recoveryCreatedAt}) in (0, 7)`,
  ),
]);

export const pgpKeys = pgTable("pgp_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }).notNull(),
  details: text("details"),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull(),
  algorithm: varchar("algorithm", { length: 64 }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  fingerprint: varchar("fingerprint", { length: 64 }).notNull(),
  publicKey: text("public_key").notNull(),
  // Armored private key, already passphrase-encrypted by openpgp.js client-side.
  // The server never receives or stores the plaintext key.
  privateKey: text("private_key").notNull(),
  // Optional opaque recovery material encrypted client-side under the user's
  // random vault key. Null remains the default strict/no-recovery state.
  escrowCiphertext: text("escrow_ciphertext"),
  escrowIv: varchar("escrow_iv", { length: 64 }),
  escrowVersion: integer("escrow_version"),
  // Generated alongside the key so it can revoke publicKey later without the passphrase.
  // Nullable: keys saved before this column existed have none.
  revocationCertificate: text("revocation_certificate"),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Denormalized (actorEmail, target as plain text, no FKs) so entries survive
// account/key deletion — an audit trail that disappears with the thing it audited is useless.
export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorEmail: varchar("actor_email", { length: 255 }).notNull(),
  action: varchar("action", { length: 64 }).notNull(),
  target: varchar("target", { length: 255 }),
  details: text("details"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// A password reset an administrator allowed for one account. The token is
// handed to the user out of band and stored only as a hash. "recovery" resets
// need the user's recovery code and keep escrowed passphrases; "forced" resets
// do not, and remove them. One active reset per account.
export const passwordResets = pgTable("password_resets", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: varchar("token_hash", { length: 64 }).notNull(),
  mode: varchar("mode", { length: 16 }).notNull(),
  issuedBy: varchar("issued_by", { length: 255 }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  attempts: integer("attempts").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check("password_resets_mode_check", sql`${table.mode} in ('recovery', 'forced')`),
]);
