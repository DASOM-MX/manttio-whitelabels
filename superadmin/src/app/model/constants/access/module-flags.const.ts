import type { TenantModules } from '../../../data/dtos/auth';
import type { ModuleKey } from '../../../access';

/** Config flag each module rides on; absent = core, always on. Equipment and
 *  CRM ride core clients; `scheduling` covers calendar + contracts (tentative
 *  flag split — open item in 14). Brand is core: it themes apps and PDFs,
 *  not just the website. */
export const MODULE_FLAG: Partial<Record<ModuleKey, keyof TenantModules>> = {
  billing: 'billing',
  wms: 'wms',
  cms: 'cms',
  calendar: 'scheduling',
  contracts: 'scheduling',
};
