import type { TemplateStatus } from '../../../data/dtos/report-template';

export const TEMPLATE_STATUS_SEVERITIES: Record<
  TemplateStatus,
  'secondary' | 'success' | 'danger'
> = {
  draft: 'secondary',
  active: 'success',
  disabled: 'danger',
};
