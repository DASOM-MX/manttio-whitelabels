/** The one color vocabulary the viz kit speaks (23 CP-3, § Direction 3).
 *
 *  Every component in the kit — tiles, bar segments, gauge arcs, chart series —
 *  takes a tone rather than a class, so the palette roles are decided in one
 *  place and a call site can never invent a hue:
 *
 *  - `Brand`/`Accent` are the two tenant-configured voices. Brand is identity
 *    and the hero series; accent is the second voice (secondary series, the
 *    second segment of a mix, decorative marks, a neutral gauge fill).
 *  - `Positive`/`Negative`/`Warning` are the **fixed** semantic set — emerald,
 *    red, amber, never brand-derived — so a tenant's hue can't make "down"
 *    look green.
 *  - `Neutral` is the fixed surface scale: the rest of a mix, an unfilled
 *    track, a value with no direction.
 *
 *  Class maps live in `model/constants/viz/`, one per surface kind (a rule
 *  needs a fill, a numeral needs text contrast — the same tone resolves to
 *  different steps). */
export enum VizTone {
  Neutral = 'neutral',
  Brand = 'brand',
  Accent = 'accent',
  Positive = 'positive',
  Negative = 'negative',
  Warning = 'warning',
}
