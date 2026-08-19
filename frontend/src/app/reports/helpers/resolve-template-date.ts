/** Resolve a template date constraint into a real `Date`.
 *
 *  `'today'` is the one symbolic value the superadmin builder can store; it is
 *  resolved against the device clock at render, never at authoring time — a
 *  template that said "no later than today" must keep meaning that tomorrow.
 *  Anything else is an ISO date string; anything unparseable yields `undefined`
 *  so the control simply goes unconstrained rather than rejecting every value. */
export const resolveDate = (raw: string | undefined): Date | undefined => {
  if (!raw) return undefined;
  if (raw === 'today') return new Date();
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};
