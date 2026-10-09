CREATE TABLE "password_resets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"mode" varchar(16) NOT NULL,
	"issued_by" varchar(255) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "password_resets_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "password_resets_mode_check" CHECK ("password_resets"."mode" in ('recovery', 'forced'))
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "recovery_wrapped_key" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "recovery_kdf_salt" varchar(64);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "recovery_kdf_iv" varchar(64);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "recovery_kdf_iterations" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "recovery_wrap_version" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "recovery_verifier_hash" varchar(64);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "recovery_created_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_recovery_all_or_nothing" CHECK (num_nulls("users"."recovery_wrapped_key", "users"."recovery_kdf_salt", "users"."recovery_kdf_iv", "users"."recovery_kdf_iterations", "users"."recovery_wrap_version", "users"."recovery_verifier_hash", "users"."recovery_created_at") in (0, 7));