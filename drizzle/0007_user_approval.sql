-- Accounts that existed before approval was introduced stay usable: add the
-- column as 'active' so every current row gets that value, then make the
-- locked 'pending' state the default for every account created from now on.
ALTER TABLE "users" ADD COLUMN "status" varchar(20) DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "status" SET DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_status_check" CHECK ("users"."status" in ('pending', 'active', 'rejected'));
