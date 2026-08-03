import { toCalendarDate } from './utils';
import type { Visit } from './dtos/visit';
import type { VisitBlock, VisitRect } from './types/calendar/visit-block.type';

/** Pure geometry for the time-axis grid (12 §3). Kept out of the page component
 *  because it is the one part of the calendar with real logic — overlap packing
 *  — and it should be readable on its own. */

/** The axis runs the whole day, always. The grid opens at 00:00 rather than at
 *  business hours because the shop takes emergency calls at midnight, and a view
 *  that hides them is worse than one with dead space at the top. */
export const MINUTES_PER_DAY = 24 * 60;

/** Minutes since local midnight, read off the local clock fields rather than
 *  differenced against a midnight `Date`. On a DST day the difference would put
 *  every block an hour out; the wall-clock reading is what a calendar means by
 *  "09:00" regardless. */
const minutesOfDay = (date: Date): number => date.getHours() * 60 + date.getMinutes();

/** A rectangle from a start instant and a length, clamped at the bottom of the
 *  day. A visit booked at 23:00 for two hours is drawn to midnight and no
 *  further — the remainder belongs to a day this column is not showing. */
const rect = (start: Date, durationMinutes: number): VisitRect => {
  const top = minutesOfDay(start);
  return {
    top: (top / MINUTES_PER_DAY) * 100,
    height: (Math.min(durationMinutes, MINUTES_PER_DAY - top) / MINUTES_PER_DAY) * 100,
  };
};

/** A block plus the span it occupies on the axis, which is what the overlap
 *  packing reasons about: booking and real time together, since a job that
 *  started early or ran long competes for the same column width. */
interface Span {
  block: VisitBlock;
  from: number;
  to: number;
}

const toSpan = (visit: Visit): Span => {
  // `expectedDurationMinutes` is the authority, not `scheduledEnd`: the backend
  // derives the end from the duration and writes the pair together, so reading
  // the duration skips a parse and cannot disagree with itself.
  const planned = rect(new Date(visit.scheduledStart), visit.expectedDurationMinutes);

  // An `actualEnd` with no `actualStart` is a real state — office may complete a
  // visit no technician ever started — but it is an instant, not a span, so
  // there is nothing to draw. The dialog reports it; the grid stays honest.
  const actualStart = visit.actualStart ? new Date(visit.actualStart) : undefined;
  const actual = actualStart
    ? rect(actualStart, visit.actualDurationMinutes ?? visit.expectedDurationMinutes)
    : undefined;

  const block: VisitBlock = {
    visit,
    solid: actual ?? planned,
    ghost: actual ? planned : undefined,
    // Keyed on the missing *duration*, not on `in_progress`: a visit office
    // completed from the admin has a real start and no end either, and a closed
    // rectangle there would report a finish time nobody ever recorded.
    openEnded: !!actualStart && visit.actualDurationMinutes === undefined,
    left: 0,
    width: 100,
    laneCount: 1,
  };
  return {
    block,
    from: Math.min(planned.top, block.solid.top),
    to: Math.max(planned.top + planned.height, block.solid.top + block.solid.height),
  };
};

/** Breathing room between side-by-side lanes, as a percentage of the column.
 *  Taken out of each block's width rather than added as a margin, which an
 *  absolutely positioned box with an explicit `left` would ignore. */
const LANE_GAP = 1.5;

/** Give every visit in one overlap cluster a lane, greedily: reuse the first
 *  lane whose previous occupant has already ended, else open a new one. The
 *  whole cluster then shares the widest lane count, so overlapping blocks line
 *  up in even columns instead of each picking its own width. */
const assignLanes = (cluster: Span[]): void => {
  const laneEnds: number[] = [];
  const lanes: number[] = [];
  for (const span of cluster) {
    let lane = laneEnds.findIndex((end) => end <= span.from);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = span.to;
    lanes.push(lane);
  }
  const laneCount = laneEnds.length;
  const width = 100 / laneCount;
  cluster.forEach((span, i) => {
    span.block.left = lanes[i] * width;
    span.block.width = laneCount > 1 ? width - LANE_GAP : width;
    span.block.laneCount = laneCount;
  });
};

/** Lay out one day column: position every visit on the 24-hour axis and split
 *  the column between the ones that overlap. The split is per cluster, not per
 *  day, so one busy morning doesn't narrow an otherwise empty afternoon. */
export const layOutDay = (visits: Visit[]): VisitBlock[] => {
  const spans = visits.map(toSpan).sort((a, b) => a.from - b.from || b.to - a.to);

  let cluster: Span[] = [];
  let clusterEnd = -Infinity;
  for (const span of spans) {
    // A gap: nothing in the cluster is still running when this one starts, so it
    // begins a new one and the widths reset.
    if (cluster.length && span.from >= clusterEnd) {
      assignLanes(cluster);
      cluster = [];
      clusterEnd = -Infinity;
    }
    cluster.push(span);
    clusterEnd = Math.max(clusterEnd, span.to);
  }
  if (cluster.length) assignLanes(cluster);

  return spans.map((span) => span.block);
};

/** Which column a visit belongs to: the day it was **booked** for, even when the
 *  technician started it after midnight. The booking is the anchor — office
 *  looks for a visit where it put it. */
export const visitDayKey = (visit: Visit): string => toCalendarDate(new Date(visit.scheduledStart));
