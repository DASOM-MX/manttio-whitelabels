import type { LucideIcon } from '@lucide/angular';
import type { Role } from '../../dtos/auth';
import type { ModuleKey } from './module-key.type';

export interface NavChild {
  label: string;
  route: string;
  /** Exact-match highlight — set when sibling routes nest under this one. */
  exact?: boolean;
  /** Narrower gate than the parent module's (e.g. the CRM Panel is
   *  owner/admin inside the office-visible Clientes group). Omitted = the
   *  module gate alone decides. */
  roles?: readonly Role[];
}

export interface NavEntry {
  label: string;
  icon: LucideIcon;
  route: string;
  module: ModuleKey;
  /** Exact-match highlight — set when sibling routes nest under this one. */
  exact?: boolean;
  children?: NavChild[];
}
