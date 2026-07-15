// Pure RGBA8 raster ops for the brand icon generation — no canvas in Workers,
// so resampling is done by hand. Bilinear sampling happens on premultiplied
// alpha (avoids dark halos around transparent edges), then un-premultiplies
// before compositing.

export type RgbaImage = { width: number; height: number; data: Uint8Array };

/** 0…255 channels; `null` background keeps the canvas transparent. */
export type IconBackground = { r: number; g: number; b: number } | null;

/**
 * Contain-fit `src` into a `size`×`size` canvas, scaled to `scale` of the box
 * and centered, bilinear-resampled and alpha-composited over `background`.
 */
export const compositeIcon = (
  src: RgbaImage,
  size: number,
  scale: number,
  background: IconBackground,
): RgbaImage => {
  const out = new Uint8Array(size * size * 4);
  if (background) {
    for (let i = 0; i < out.length; i += 4) {
      out[i] = background.r;
      out[i + 1] = background.g;
      out[i + 2] = background.b;
      out[i + 3] = 255;
    }
  }

  const box = size * scale;
  const ratio = Math.min(box / src.width, box / src.height);
  const dw = Math.max(1, Math.round(src.width * ratio));
  const dh = Math.max(1, Math.round(src.height * ratio));
  const dx0 = Math.round((size - dw) / 2);
  const dy0 = Math.round((size - dh) / 2);

  const clamp = (n: number, max: number) => Math.min(Math.max(n, 0), max);

  for (let dy = 0; dy < dh; dy++) {
    const sy = clamp(((dy + 0.5) * src.height) / dh - 0.5, src.height - 1);
    const y0 = Math.floor(sy);
    const y1 = Math.min(y0 + 1, src.height - 1);
    const fy = sy - y0;

    for (let dx = 0; dx < dw; dx++) {
      const sx = clamp(((dx + 0.5) * src.width) / dw - 0.5, src.width - 1);
      const x0 = Math.floor(sx);
      const x1 = Math.min(x0 + 1, src.width - 1);
      const fx = sx - x0;

      // Premultiplied bilinear accumulation over the four neighbors.
      let pr = 0;
      let pg = 0;
      let pb = 0;
      let pa = 0;
      const neighbors: Array<[number, number, number]> = [
        [x0, y0, (1 - fx) * (1 - fy)],
        [x1, y0, fx * (1 - fy)],
        [x0, y1, (1 - fx) * fy],
        [x1, y1, fx * fy],
      ];
      for (const [nx, ny, w] of neighbors) {
        const si = (ny * src.width + nx) * 4;
        const wa = (w * src.data[si + 3]!) / 255;
        pr += wa * src.data[si]!;
        pg += wa * src.data[si + 1]!;
        pb += wa * src.data[si + 2]!;
        pa += wa;
      }
      const r = pa > 0 ? pr / pa : 0;
      const g = pa > 0 ? pg / pa : 0;
      const b = pa > 0 ? pb / pa : 0;

      const di = ((dy0 + dy) * size + (dx0 + dx)) * 4;
      if (background) {
        out[di] = Math.round(r * pa + out[di]! * (1 - pa));
        out[di + 1] = Math.round(g * pa + out[di + 1]! * (1 - pa));
        out[di + 2] = Math.round(b * pa + out[di + 2]! * (1 - pa));
        // alpha stays 255 (opaque tile)
      } else {
        out[di] = Math.round(r);
        out[di + 1] = Math.round(g);
        out[di + 2] = Math.round(b);
        out[di + 3] = Math.round(pa * 255);
      }
    }
  }

  return { width: size, height: size, data: out };
};
