# Client logos

Drop one image per client into this folder using the filenames below.
The component (`src/components/Clientes.astro`) references these exact paths,
so the image will swap in automatically once the file lands.

| Client                                | Sector                | Filename                       |
|---------------------------------------|-----------------------|--------------------------------|
| Oriente Sobre Hielo                   | Cadena de frío        | `oriente-sobre-hielo.png`      |
| FIMEX (Fluidos Industriales Mexicanos)| Fluidos industriales  | `fimex.png`                    |
| Coverpack                             | Empaque industrial    | `coverpack.png`                |
| Ice Dreams                            | Cadena de frío        | `ice-dreams.png`               |
| ISSSTE                                | Sector salud          | `issste.png`                   |
| NG Equipos Especializados en Renta    | Renta industrial      | `ng-equipos.png`               |

To add or remove clients, edit the `clients` array in
`src/components/Clientes.astro` and update this table to match.

## Expected asset specs
- **Format:** SVG preferred for crisp rendering at any size; transparent-PNG is
  an acceptable fallback. Aim for ~96px tall source files so the wall stays
  sharp on retina displays.
- **Aspect:** horizontal lockups read best in the 3-column grid.
- **Color:** any source color works — the wall uses a `grayscale` +
  `opacity-75` treatment that fades to full color on hover, so logos read as
  a uniform set at rest.
- **Padding:** no internal margin or background — the card itself provides
  breathing room.

## Trademarks
All client names and logos are property of their respective owners. They are
shown here as social proof of work performed by Peña Nevada Chillers; obtain
written permission before publishing if any client requests it.
