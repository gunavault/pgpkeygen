ALTER TABLE "pgp_keys" ADD COLUMN "revocation_certificate" text;--> statement-breakpoint
ALTER TABLE "pgp_keys" ADD COLUMN "revoked_at" timestamp with time zone;