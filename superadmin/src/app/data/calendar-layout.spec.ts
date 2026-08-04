import { layOutDay, visitDayKey } from './calendar-layout';
import { VisitStatus } from '../model/enums/visit/visit-status.enum';
import type { Visit } from './dtos/visit';

/** Specs for the block geometry — the one part of the calendar with real logic.
 *  Everything is asserted in percentages of the day, the unit the grid consumes:
 *  one minute is 100/1440 ≈ 0.0694%. Dates are built through local-field
 *  constructors so the specs read the same in any timezone. */

const iso = (day: number, hour: number, minute = 0): string =>
  new Date(2026, 7, day, hour, minute).toISOString();

const pct = (minutes: number): number => (minutes / (24 * 60)) * 100;

let sequence = 0;
const visit = (overrides: Partial<Visit> & Pick<Visit, 'scheduledStart'>): Visit => ({
  id: `visit-${++sequence}`,
  internalCode: `V-20260805-${String(sequence).padStart(4, '0')}`,
  customerId: 'customer-1',
  equipment: [],
  expectedDurationMinutes: 60,
  status: VisitStatus.Scheduled,
  createdBy: 'user-1',
  createdAt: iso(1, 0),
  updatedAt: iso(1, 0),
  ...overrides,
});

describe('layOutDay', () => {
  it('positions a lone visit by its times, at full width', () => {
    const [block] = layOutDay([visit({ scheduledStart: iso(5, 9) })]);
    expect(block.solid.top).toBeCloseTo(pct(9 * 60));
    expect(block.solid.height).toBeCloseTo(pct(60));
    expect(block.left).toBe(0);
    expect(block.width).toBe(100);
    expect(block.laneCount).toBe(1);
    expect(block.ghost).toBeUndefined();
    expect(block.openEnded).toBe(false);
  });

  it('clamps a block at the bottom of the day', () => {
    // Booked 23:00 for two hours — drawn to midnight and no further.
    const [block] = layOutDay([
      visit({ scheduledStart: iso(5, 23), expectedDurationMinutes: 120 }),
    ]);
    expect(block.solid.top).toBeCloseTo(pct(23 * 60));
    expect(block.solid.height).toBeCloseTo(pct(60));
  });

  it('splits overlapping visits into even lanes', () => {
    const blocks = layOutDay([
      visit({ scheduledStart: iso(5, 10), expectedDurationMinutes: 120 }),
      visit({ scheduledStart: iso(5, 11), expectedDurationMinutes: 90 }),
    ]);
    expect(blocks.map((b) => b.laneCount)).toEqual([2, 2]);
    expect(blocks[0].left).toBe(0);
    expect(blocks[1].left).toBeCloseTo(50);
    // Width gives up the lane gap, so side-by-side blocks never touch.
    for (const block of blocks) expect(block.width).toBeLessThan(50);
  });

  it('keeps overlap clusters independent — a busy morning does not narrow the afternoon', () => {
    const blocks = layOutDay([
      visit({ scheduledStart: iso(5, 9), expectedDurationMinutes: 120 }),
      visit({ scheduledStart: iso(5, 10), expectedDurationMinutes: 60 }),
      visit({ scheduledStart: iso(5, 15) }),
    ]);
    const afternoon = blocks[2];
    expect(afternoon.laneCount).toBe(1);
    expect(afternoon.width).toBe(100);
  });

  it('draws the booking as a ghost once actuals exist, solid at the real times', () => {
    const [block] = layOutDay([
      visit({
        scheduledStart: iso(5, 9),
        actualStart: iso(5, 9, 30),
        actualDurationMinutes: 90,
        status: VisitStatus.Completed,
      }),
    ]);
    expect(block.ghost).toBeDefined();
    expect(block.ghost!.top).toBeCloseTo(pct(9 * 60));
    expect(block.ghost!.height).toBeCloseTo(pct(60));
    expect(block.solid.top).toBeCloseTo(pct(9 * 60 + 30));
    expect(block.solid.height).toBeCloseTo(pct(90));
    expect(block.openEnded).toBe(false);
  });

  it('marks a started visit with no recorded duration open-ended', () => {
    const [block] = layOutDay([
      visit({
        scheduledStart: iso(5, 9),
        actualStart: iso(5, 9, 5),
        status: VisitStatus.InProgress,
      }),
    ]);
    expect(block.openEnded).toBe(true);
    // The projected length is the booking's — there is nothing else to draw.
    expect(block.solid.height).toBeCloseTo(pct(60));
  });

  it('keys open-ended on the missing duration, not on in_progress', () => {
    // Office completed this from the admin: real start, no end ever recorded.
    const [block] = layOutDay([
      visit({
        scheduledStart: iso(5, 9),
        actualStart: iso(5, 9, 10),
        status: VisitStatus.Completed,
      }),
    ]);
    expect(block.openEnded).toBe(true);
  });

  it('pins an after-midnight actual start to the booked day’s bottom edge', () => {
    // Booked Wed 23:00, Iniciar tapped Thu 00:30. The visit stays in
    // Wednesday's column (visitDayKey), so the solid block clamps to the very
    // bottom of it rather than drawing at dawn — and its span must not drag
    // unrelated visits into one overlap cluster.
    const blocks = layOutDay([
      visit({
        scheduledStart: iso(5, 23),
        actualStart: iso(6, 0, 30),
        status: VisitStatus.InProgress,
      }),
      visit({ scheduledStart: iso(5, 10) }),
    ]);
    const late = blocks.find((b) => b.ghost)!;
    expect(late.solid.top).toBeCloseTo(100);
    expect(late.solid.height).toBeCloseTo(0);
    expect(late.ghost!.top).toBeCloseTo(pct(23 * 60));
    const morning = blocks.find((b) => !b.ghost)!;
    expect(morning.laneCount).toBe(1);
    expect(morning.width).toBe(100);
  });

  it('clips an actual start from the previous day at the top', () => {
    // Booked 00:15, actually started 23:50 the night before: only the part
    // inside the booked day is drawn.
    const [block] = layOutDay([
      visit({
        scheduledStart: iso(5, 0, 15),
        actualStart: iso(4, 23, 50),
        actualDurationMinutes: 60,
        status: VisitStatus.Completed,
      }),
    ]);
    expect(block.solid.top).toBe(0);
    expect(block.solid.height).toBeCloseTo(pct(50));
  });

  it('returns blocks ordered by start regardless of input order', () => {
    const blocks = layOutDay([
      visit({ scheduledStart: iso(5, 15) }),
      visit({ scheduledStart: iso(5, 9) }),
    ]);
    expect(blocks[0].solid.top).toBeLessThan(blocks[1].solid.top);
  });
});

describe('visitDayKey', () => {
  it('buckets by the booked day, even when the visit started after midnight', () => {
    const key = visitDayKey(
      visit({ scheduledStart: iso(5, 23), actualStart: iso(6, 0, 30) }),
    );
    expect(key).toBe('2026-08-05');
  });
});
