import type { TemplateStatus } from '../enums/report-templates.enum';

// Status transition predicates. The status literals + TEMPLATE_STATUSES array live in
// enums/report-templates.enum.ts; these predicates are the single place lifecycle
// decisions are made (don't hardcode status strings in controllers/services).
// Lifecycle: draft ⇄ active → disabled (terminal), 06 §5.2.
export const isDraft = (s: TemplateStatus) => s === 'draft';

export const isActive = (s: TemplateStatus) => s === 'active';

export const isDisabled = (s: TemplateStatus) => s === 'disabled';
