import type { ModuleKey } from '../../../access';

/** Flag each module rides on; absent = core, always on. Equipment and CRM
 *  ride core clients; `scheduling` covers calendar + contracts (tentative
 *  flag split — open item in 14). Brand is core: it themes apps and PDFs,
 *  not just the website. The tenant-config feature that will set these is a
 *  pending item (2026-07-14) — until it lands, flagged modules stay off. */
export const MODULE_FLAG: Partial<Record<ModuleKey, string>> = {
  billing: 'billing',
  wms: 'wms',
  cms: 'cms',
  calendar: 'scheduling',
  contracts: 'scheduling',
};
