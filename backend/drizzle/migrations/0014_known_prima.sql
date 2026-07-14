CREATE TABLE IF NOT EXISTS "brand" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"name" text NOT NULL,
	"slogan" text,
	"description" text,
	"site_url" text,
	"logo_key" text,
	"logo_dark_key" text,
	"isologo_key" text,
	"favicon_key" text,
	"colors" jsonb NOT NULL,
	"contact" jsonb,
	"social" jsonb,
	"font" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brand_singleton_check" CHECK ("brand"."id" = 1)
);
