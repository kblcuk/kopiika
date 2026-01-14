CREATE TABLE IF NOT EXISTS "entities" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"currency" text NOT NULL,
	"icon" text,
	"color" text,
	"owner_id" text,
	"order" integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_entities_type" ON "entities" ("type");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "plans" (
	"id" text PRIMARY KEY NOT NULL,
	"entity_id" text NOT NULL,
	"period" text NOT NULL,
	"period_start" text NOT NULL,
	"planned_amount" real NOT NULL,
	FOREIGN KEY ("entity_id") REFERENCES "entities"("id") ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_plans_entity_period" ON "plans" ("entity_id","period_start");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"from_entity_id" text NOT NULL,
	"to_entity_id" text NOT NULL,
	"amount" real NOT NULL,
	"currency" text NOT NULL,
	"timestamp" integer NOT NULL,
	"note" text,
	FOREIGN KEY ("from_entity_id") REFERENCES "entities"("id") ON UPDATE no action ON DELETE no action,
	FOREIGN KEY ("to_entity_id") REFERENCES "entities"("id") ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_transactions_timestamp" ON "transactions" ("timestamp");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_transactions_from" ON "transactions" ("from_entity_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_transactions_to" ON "transactions" ("to_entity_id");
