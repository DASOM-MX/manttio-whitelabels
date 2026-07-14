// Converters from the stored scale format — "H S% L%" components (rule 2) —
// into the color spaces render paths need: hex for email HTML (Outlook's Word
// engine doesn't parse hsl()) and 0…1 RGB floats for pdf-lib. Parse failures
// return null so callers fall back to their neutral defaults.

export type Rgb01 = { r: number; g: number; b: number };

const HSL_COMPONENTS_RE = /^(\d{1,3}(?:\.\d+)?) (\d{1,3}(?:\.\d+)?)% (\d{1,3}(?:\.\d+)?)%$/;

const parse = (value: string): { h: number; s: number; l: number } | null => {
  const m = HSL_COMPONENTS_RE.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const s = Number(m[2]);
  const l = Number(m[3]);
  if (h > 360 || s > 100 || l > 100) return null;
  return { h, s: s / 100, l: l / 100 };
};

export const hslToRgb01 = (value: string): Rgb01 | null => {
  const parsed = parse(value);
  if (!parsed) return null;
  const { h, s, l } = parsed;
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const hue = (h % 360) / 60;
  const x = chroma * (1 - Math.abs((hue % 2) - 1));
  const m = l - chroma / 2;
  const sextant = Math.floor(hue) % 6;
  const [r, g, b] = [
    [chroma, x, 0],
    [x, chroma, 0],
    [0, chroma, x],
    [0, x, chroma],
    [x, 0, chroma],
    [chroma, 0, x],
  ][sextant]!;
  return { r: r! + m, g: g! + m, b: b! + m };
};

export const hslToHex = (value: string): string | null => {
  const rgb = hslToRgb01(value);
  if (!rgb) return null;
  const channel = (n: number) =>
    Math.round(Math.min(1, Math.max(0, n)) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${channel(rgb.r)}${channel(rgb.g)}${channel(rgb.b)}`;
};
