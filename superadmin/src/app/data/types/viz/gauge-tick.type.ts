/** One tick of the `gauge-card` arc, in the SVG's own coordinate space.
 *  Geometry is computed once at module scope (the arc never changes shape),
 *  so a render is a `[class]` swap per tick and nothing else. */
export interface GaugeTick {
  index: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}
