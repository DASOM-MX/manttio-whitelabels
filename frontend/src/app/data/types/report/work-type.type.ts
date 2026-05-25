// Keep in sync with backend/src/validators/reports.ts → workTypes
// and the `reports_work_type_check` constraint in backend/src/db/schema.ts.
export const WORK_TYPES = ['Preventivo', 'Correctivo', 'Instalación'] as const;
export type WorkType = (typeof WORK_TYPES)[number];
