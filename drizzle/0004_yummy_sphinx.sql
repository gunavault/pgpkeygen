ALTER TABLE "pgp_keys" ADD COLUMN "escrow_ciphertext" text;--> statement-breakpoint
ALTER TABLE "pgp_keys" ADD COLUMN "escrow_iv" varchar(64);--> statement-breakpoint
ALTER TABLE "pgp_keys" ADD COLUMN "escrow_version" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "vault_wrapped_key" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "vault_kdf_salt" varchar(64);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "vault_kdf_iv" varchar(64);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "vault_kdf_iterations" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "vault_wrap_version" integer;