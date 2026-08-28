import { deltaPillView } from './delta-pill-view';
import { DELTA_DIRECTION_ICONS } from '../../model/constants/viz/delta-direction-icons.const';
import { DeltaDirection } from '../../model/enums/viz/delta-direction.enum';
import { VizTone } from '../../model/enums/viz/viz-tone.enum';

/** Specs for the delta pill's reading — the point of each is that direction
 *  and color are separable, which is what lets a metric where falling is the
 *  win keep an honest arrow. */

describe('deltaPillView', () => {
  it('reads up as positive and down as negative by default', () => {
    expect(deltaPillView({ text: '+3', direction: DeltaDirection.Up })?.pillClass).toContain(
      'emerald',
    );
    expect(deltaPillView({ text: '-3', direction: DeltaDirection.Down })?.pillClass).toContain(
      'red',
    );
  });

  it('reads flat as neither', () => {
    const view = deltaPillView({ text: '0', direction: DeltaDirection.Flat });
    expect(view?.pillClass).toContain('surface');
    expect(view?.icon).toBe(DELTA_DIRECTION_ICONS[DeltaDirection.Flat]);
  });

  it('lets a metric where falling is the win keep the down arrow and go green', () => {
    const view = deltaPillView({
      text: '-4',
      direction: DeltaDirection.Down,
      tone: VizTone.Positive,
    });
    expect(view?.icon).toBe(DELTA_DIRECTION_ICONS[DeltaDirection.Down]);
    expect(view?.pillClass).toContain('emerald');
  });

  it('passes the caller’s text through verbatim, sign and all', () => {
    expect(deltaPillView({ text: '+2 pp', direction: DeltaDirection.Up })?.text).toBe('+2 pp');
  });

  it('renders nothing when there is no delta to show', () => {
    expect(deltaPillView(null)).toBeNull();
    expect(deltaPillView(undefined)).toBeNull();
  });
});
