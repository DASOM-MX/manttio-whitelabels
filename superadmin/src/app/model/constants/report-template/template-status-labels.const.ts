import type { TemplateStatus } from '../../../data/dtos/report-template';

export const TEMPLATE_STATUS_LABELS: Record<TemplateStatus, string> = {
  draft: 'Borrador',
  active: 'Activa',
  disabled: 'Deshabilitada',
};
