-- Report closing remarks. Part of the fixed skeleton (03 §2) — every report has
-- them regardless of template, so they live on the header, not in the capture
-- snapshot. Nullable: a report with nothing to add carries none.
ALTER TABLE "reports" ADD COLUMN IF NOT EXISTS "comments" text;
