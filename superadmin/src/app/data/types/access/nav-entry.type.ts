import type { LucideIcon } from '@lucide/angular';
import type { ModuleKey } from './module-key.type';

export interface NavChild {
  label: string;
  route: string;
  /** Exact-match highlight — set when sibling routes nest under this one. */
  exact?: boolean;
  /** Per-child access gate — required since the 2026-07-22 regroup put
   *  mixed-module children under one group; omit only when the parent
   *  group's `module` already gates the whole subtree. */
  module?: ModuleKey;
}

export interface NavEntry {
  label: string;
  icon: LucideIcon;
  route: string;
  /** Gates the whole entry (and subtree). Omit on mixed-module groups —
   *  their children carry their own `module` gates and the group hides
   *  itself when every child is filtered out. */
  module?: ModuleKey;
  /** Exact-match highlight — set when sibling routes nest under this one. */
  exact?: boolean;
  children?: NavChild[];
}
