# Client logos

Drop one image per client into this folder using the placeholder pattern below.
The `Clientes.astro` component currently references six slots:

| Slot       | Filename         |
|------------|------------------|
| Cliente 1  | `client_1.png`   |
| Cliente 2  | `client_2.png`   |
| Cliente 3  | `client_3.png`   |
| Cliente 4  | `client_4.png`   |
| Cliente 5  | `client_5.png`   |
| Cliente 6  | `client_6.png`   |

Add or remove entries by editing the `clients` array in
`src/components/Clientes.astro`. Replace `name` with the real company name so
the alt text and `aria-label` are accurate; rename the file to something
human-readable (e.g. `cervezas-cuauhtemoc.png`) and update the `src` to match.

## Expected asset specs
- **Format:** SVG preferred for crisp rendering at any size; transparent-PNG is
  an acceptable fallback. Aim for ~96px tall source files so the wall stays
  sharp on retina displays.
- **Aspect:** horizontal lockups read best in the grid.
- **Color:** any source color works — the wall uses a `grayscale` +
  `opacity-70` treatment that fades to full color on hover, so logos read as
  a uniform set at rest.
- **Padding:** no internal margin or background — the card itself provides
  breathing room.

## Trademarks
All client names and logos are property of their respective owners. They are
shown here as social proof of work performed by Peña Nevada Chillers; obtain
written permission before publishing if any client requests it.
