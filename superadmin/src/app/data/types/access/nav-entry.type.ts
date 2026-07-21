import type { LucideIcon } from '@lucide/angular';
import type { ModuleKey } from './module-key.type';

export interface NavChild {
  label: string;
  route: string;
  /** Exact-match highlight — set when sibling routes nest under this one. */
  exact?: boolean;
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
