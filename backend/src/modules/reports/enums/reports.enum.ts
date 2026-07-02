// Report domain enums (literal unions + their value arrays). Kept separate from the
// zod validators so the DB check constraints and the type layer share one source.

// Work-type enum. Keep these literals in sync with the `reports_work_type_check`
// constraint in `models/reports.model.ts`.
export const workTypes = ['Preventivo', 'Correctivo', 'Instalación'] as const;
export type WorkType = (typeof workTypes)[number];

// Report content variants. Each value must have a matching zod schema in
// `validators/reports.validator.ts` (`reportSchemas`). No DB migration is required
// to add one — add the literal here and the schema there.
export const reportTypes = ['minisplit', 'chiller', 'uma'] as const;
export type ReportType = (typeof reportTypes)[number];

// Report lifecycle status. Keep in sync with the `reports_status_check` constraint
// and the `status` column `$type` in `models/reports.model.ts`.
export const REPORT_STATUSES = ['created', 'in-progress', 'finished', 'mailed'] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];
