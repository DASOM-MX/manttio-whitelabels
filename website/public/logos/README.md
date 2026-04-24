# Manufacturer logos

Drop one SVG per brand into this folder, using the exact filenames below so
`Manufacturers.astro` picks them up without further edits.

| Brand      | Filename         |
|------------|------------------|
| Carrier    | `carrier.png`    |
| York       | `york.png`       |
| Trane      | `trane.png`      |
| Lennox     | `lennox.png`     |
| Lenomex    | `lenomex.png`    |
| Danfoss    | `danfoss.png`    |
| Honeywell  | `honeywell.png`  |
| BOSCH      | `bosch.png`      |

## Expected asset specs
- **Format:** SVG preferred (infinite scaling, no halos). PNG with transparent
  background is an acceptable fallback.
- **Aspect:** horizontal wordmark lockups read best in the 3-column grid.
- **Color:** single-color or full-color both work — the wall uses a
  `grayscale` + `opacity-70` treatment that fades to full color on hover, so
  the default rest state will look uniform regardless of source color.
- **Padding:** no internal margin/background — the card itself provides
  breathing room. Tight-cropped SVGs render best.
- **Viewbox:** trim whitespace so logos sit centered in the card.

## Trademarks
All brand names and logos are property of their respective owners. Usage on
this site is limited to identifying manufacturers whose equipment Peña Nevada
Chillers integrates, installs and services.
