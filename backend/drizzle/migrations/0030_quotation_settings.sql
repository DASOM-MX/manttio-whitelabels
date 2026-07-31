-- 20 CP-3 PR-C: tenant-level quotation defaults. Singleton row ('default');
-- the builder prefills a new quote's comments from default_comments.
CREATE TABLE IF NOT EXISTS "quotation_settings" (
  "id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
  "default_comments" text DEFAULT '' NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" uuid REFERENCES "users"("id") ON DELETE RESTRICT
);
