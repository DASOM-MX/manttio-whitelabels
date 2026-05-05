# Web-app rules

## Styling
- Use **Tailwind CSS 3.4 only**. Do not upgrade or downgrade. If a new utility/class is needed, add it to `tailwind.config.js` (extend `theme`) rather than using arbitrary values inline.
- Prefer `size-*` over paired `w-*`/`h-*` when width and height are equal (e.g. `w-4 h-4` → `size-4`).
- **Never** use inline `style="..."` attributes (or `[style]` / `[ngStyle]`) in Angular templates. All styling goes through Tailwind classes or component-scoped styles (`styles` / `styleUrls` on the component, or the component's `.css` file).
- The color palette is shared with the marketing site (`/website`). Use the `granite`, `navy`, `sky`, and `cyan` scales or the semantic tokens (`background`, `surface`, `primary`, `secondary`, `dark`) — do not introduce new ad-hoc hex values.

## Angular
- Always use the **`inject()`** function for dependency injection — never constructor-parameter injection. Declare each dependency as a class field: `private http = inject(HttpClient);`. Do not write `constructor(private http: HttpClient) {}`.
- Prefer **Reactive Forms** (`FormBuilder` + `FormGroup` + `formControlName`) over template-driven `[(ngModel)]` for any form group.

## Animations
- Use **anime.js** for animations only. Do not use it as a general utility library.
- Do not animate via CSS keyframes, Angular animations, or other libraries unless explicitly requested.
