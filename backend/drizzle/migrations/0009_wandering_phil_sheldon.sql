CREATE TABLE IF NOT EXISTS "cms_clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"legal" text,
	"sector" text,
	"logo_key" text,
	"business_relation_description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cms_documents" (
	"section" text PRIMARY KEY NOT NULL,
	"draft" jsonb,
	"published" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	CONSTRAINT "cms_documents_section_check" CHECK ("cms_documents"."section" in ('home', 'clients'))
);
