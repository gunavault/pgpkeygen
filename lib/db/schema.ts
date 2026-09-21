import { integer, pgTable, uuid, varchar, text, timestamp } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: varchar("role", { length: 20 }).notNull().default("user"),
  sessionsValidAfter: timestamp("sessions_valid_after", { withTimezone: true }),
  // Client-created random vault key, wrapped under a password-derived KEK.
  // All fields remain nullable so existing accounts and users who never opt in
  // have no escrow state at all.
  vaultWrappedKey: text("vault_wrapped_key"),
  vaultKdfSalt: varchar("vault_kdf_salt", { length: 64 }),
  vaultKdfIv: varchar("vault_kdf_iv", { length: 64 }),
  vaultKdfIterations: integer("vault_kdf_iterations"),
  vaultWrapVersion: integer("vault_wrap_version"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

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
