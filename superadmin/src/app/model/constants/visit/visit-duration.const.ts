/** The planned length of a visit, in minutes (12 §1, owner 2026-07-31). Mirrors
 *  the API's own bounds so the form refuses what the backend would refuse
 *  anyway, with the message next to the field instead of in a toast.
 *
 *  Required with a 60-minute default: the calendar draws a visit as a block, and
 *  a block needs a height — a booking made without thinking about duration is an
 *  hour long, not undefined. */
export const DEFAULT_VISIT_DURATION_MINUTES = 60;

/** A day. Anything longer is a multi-day job, which is several visits on one
 *  order rather than one enormous block. */
export const MAX_VISIT_DURATION_MINUTES = 24 * 60;
