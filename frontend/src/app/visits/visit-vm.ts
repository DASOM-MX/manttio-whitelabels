import { PendingVisitActionType } from '../../offline/pending-visit-action.model';
import type { PendingVisitAction } from '../../offline/pending-visit-action.model';
import { VisitStatus } from '../data/types/visit';
import type { Visit } from '../data/dtos/visit';

/** The status one queued tap lands the visit in, once the server accepts it. */
const TAP_RESULT: Record<PendingVisitActionType, VisitStatus> = {
  [PendingVisitActionType.Start]: VisitStatus.InProgress,
  [PendingVisitActionType.Respond]: VisitStatus.Completed,
  [PendingVisitActionType.Close]: VisitStatus.Closed,
};

/** One visit as the field screens read it: the server's record with this
 *  device's un-delivered taps laid over it. Offline the tap is the only thing
 *  that has happened, so the overlay is what makes Iniciar feel like it worked
 *  — `hasPending` is what admits the state isn't confirmed yet. */
export interface VisitVM {
  visit: Visit;
  status: VisitStatus;
  pending: PendingVisitAction[];
  hasPending: boolean;
  /** Actual times including un-synced taps, so a start shows its field time
   *  before the server has ever heard of it. */
  actualStart?: string;
  actualEnd?: string;
  canStart: boolean;
  canRespond: boolean;
  canClose: boolean;
}

export interface VisitDayGroup {
  /** Device-local day, the grouping key. */
  key: string;
  /** Any timestamp inside the day — what the heading formats. */
  at: string;
  visits: VisitVM[];
}

/** Device-local `Y-M-D`. Grouping on the ISO string's first 10 chars would
 *  group by **UTC** day and split an evening visit off from its own date. */
export function localDayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function toVisitVM(visit: Visit, pending: PendingVisitAction[]): VisitVM {
  const taps = [...pending].sort((a, b) => a.at.localeCompare(b.at));
  // The newest tap is the one the technician last asked for; earlier ones in
  // the same chain are already reflected in it.
  const last = taps.at(-1);
  const status = last ? TAP_RESULT[last.action] : visit.status;
  const startTap = taps.find((t) => t.action === PendingVisitActionType.Start);
  const endTap = taps.find((t) => t.action === PendingVisitActionType.Respond);
  return {
    visit,
    status,
    pending: taps,
    hasPending: taps.length > 0,
    actualStart: visit.actualStart ?? startTap?.at,
    actualEnd: visit.actualEnd ?? endTap?.at,
    canStart: status === VisitStatus.Scheduled,
    canRespond: status === VisitStatus.InProgress,
    canClose: status === VisitStatus.Scheduled || status === VisitStatus.InProgress,
  };
}

/** Bucket the whole queue by visit once, instead of scanning it per row. */
export function pendingByVisit(pending: PendingVisitAction[]): Map<string, PendingVisitAction[]> {
  const map = new Map<string, PendingVisitAction[]>();
  for (const p of pending) {
    const bucket = map.get(p.visitId);
    if (bucket) bucket.push(p);
    else map.set(p.visitId, [p]);
  }
  return map;
}

/** Consecutive-run grouping — correct only because the caller sorted by
 *  `scheduledStart` first. */
export function groupByDay(vms: VisitVM[]): VisitDayGroup[] {
  const groups: VisitDayGroup[] = [];
  for (const vm of vms) {
    const key = localDayKey(vm.visit.scheduledStart);
    const last = groups.at(-1);
    if (last?.key === key) last.visits.push(vm);
    else groups.push({ key, at: vm.visit.scheduledStart, visits: [vm] });
  }
  return groups;
}
