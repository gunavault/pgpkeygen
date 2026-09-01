import { pgTable, uuid, varchar, text, timestamp } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: varchar("role", { length: 20 }).notNull().default("user"),
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
