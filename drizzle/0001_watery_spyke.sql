ALTER TABLE "pgp_keys" ADD COLUMN "title" varchar(255);--> statement-breakpoint
ALTER TABLE "pgp_keys" ADD COLUMN "details" text;--> statement-breakpoint
ALTER TABLE "pgp_keys" ADD COLUMN "algorithm" varchar(64);--> statement-breakpoint
ALTER TABLE "pgp_keys" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
UPDATE "pgp_keys" SET "title" = "name", "algorithm" = 'unknown (pre-existing key)' WHERE "title" IS NULL;--> statement-breakpoint
ALTER TABLE "pgp_keys" ALTER COLUMN "title" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "pgp_keys" ALTER COLUMN "algorithm" SET NOT NULL;
