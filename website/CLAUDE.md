# Website rules

## Styling
- Use **Tailwind CSS 3.4.17 only**. Do not upgrade or downgrade. If a new utility/class is needed, add it to `tailwind.config.*` (extend `theme`) rather than using arbitrary values inline.
- Prefer `size-*` over paired `w-*`/`h-*` when width and height are equal (e.g. `w-4 h-4` → `size-4`).
- **Never** use inline `style="..."` attributes in HTML/Astro/JSX templates. All styling goes through Tailwind classes or component-scoped `<style>` blocks.

## Animations
- Use **anime.js** for animations only. Do not use it as a general utility library.
- Do not animate via CSS keyframes or other libraries unless explicitly requested.
