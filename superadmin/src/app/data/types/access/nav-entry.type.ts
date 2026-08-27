import type { LucideIcon } from '@lucide/angular';
import type { ModuleKey } from './module-key.type';

/** Optional right-aligned count on a nav row (23 CP-2, reference screenshot).
 *  **Only ever a real number from a real read.** The row renders no pill when
 *  it is absent or zero — an empty badge is the decorative placeholder the plan
 *  forbids, and a fabricated one is worse. Nothing sets it yet: the app has no
 *  per-module count endpoint, so the slot waits for a source. */
export interface NavBadge {
  badge?: number;
}

export interface NavChild extends NavBadge {
  label: string;
  route: string;
  /** Exact-match highlight — set when sibling routes nest under this one. */
  exact?: boolean;
  /** Per-child access gate — required since the 2026-07-22 regroup put
   *  mixed-module children under one group; omit only when the parent
   *  group's `module` already gates the whole subtree. */
  module?: ModuleKey;
}

export interface NavEntry extends NavBadge {
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
