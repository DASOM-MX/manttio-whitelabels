import { gaugeFilledTicks } from './gauge-fill';

/** Specs for the gauge's fill count — the arc is 40 ticks in the app, so the
 *  cases that matter are the ends, the rounding, and null-is-not-zero. */

describe('gaugeFilledTicks', () => {
  it('fills the share of the arc the value names', () => {
    expect(gaugeFilledTicks(50, 40)).toBe(20);
    expect(gaugeFilledTicks(68, 50)).toBe(34);
  });

  it('empties at 0 and fills completely at 100', () => {
    expect(gaugeFilledTicks(0, 40)).toBe(0);
    expect(gaugeFilledTicks(100, 40)).toBe(40);
  });

  it('treats null as "no reading", not as zero percent', () => {
    expect(gaugeFilledTicks(null, 40)).toBe(0);
    expect(gaugeFilledTicks(Number.NaN, 40)).toBe(0);
  });

  it('clamps out-of-range values instead of overflowing the arc', () => {
    expect(gaugeFilledTicks(140, 40)).toBe(40);
    expect(gaugeFilledTicks(-20, 40)).toBe(0);
  });

  it('rounds to the nearest tick', () => {
    expect(gaugeFilledTicks(1, 40)).toBe(0);
    expect(gaugeFilledTicks(2, 40)).toBe(1);
  });
});
