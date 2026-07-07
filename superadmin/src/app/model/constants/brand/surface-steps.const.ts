import { PRIMARY_STEPS } from './primary-steps.const';

/** Surface scale steps (03 §3) — adds step 0 (white anchor). */
export const SURFACE_STEPS = ['0', ...PRIMARY_STEPS] as const;
