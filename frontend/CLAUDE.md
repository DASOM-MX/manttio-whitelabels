# Web-app rules

## Styling
- Use **Tailwind CSS 3.4 only**. Do not upgrade or downgrade. If a new utility/class is needed, add it to `tailwind.config.js` (extend `theme`) rather than using arbitrary values inline.
- Prefer `size-*` over paired `w-*`/`h-*` when width and height are equal (e.g. `w-4 h-4` → `size-4`).
- **Never** use inline `style="..."` attributes (or `[style]` / `[ngStyle]`) in Angular templates. All styling goes through Tailwind classes or component-scoped styles (`styles` / `styleUrls` on the component, or the component's `.css` file).
- The color palette is shared with the marketing site (`/website`). Use the `granite`, `navy`, `sky`, and `cyan` scales or the semantic tokens (`background`, `surface`, `primary`, `secondary`, `dark`) — do not introduce new ad-hoc hex values.

## Angular
- Always use the **`inject()`** function for dependency injection — never constructor-parameter injection. Declare each dependency as a class field: `private http = inject(HttpClient);`. Do not write `constructor(private http: HttpClient) {}`.
- Prefer **Reactive Forms** (`FormBuilder` + `FormGroup` + `formControlName`) over template-driven `[(ngModel)]` for any form group.
- Use the **new built-in control flow syntax** in templates: `@if`, `@else if`, `@else`, `@for (item of items; track item.id) { }`, `@switch / @case / @default`. Do not use `*ngIf`, `*ngFor`, `*ngSwitch`, `*ngSwitchCase`, `*ngSwitchDefault`, `[ngIfElse]`, or `<ng-template>`-based fallbacks. When migrating, also drop `CommonModule` imports if `@if`/`@for`/`@switch` are the only directives used.
- Prefer **signals (`signal`, `computed`)** over plain class properties for any reactive component state. Use `store.selectSignal(...)` from NGXS instead of `store.select(...)`. Templates call signals as functions (`{{ total() }}`) — do not wrap with `async`. Plain non-reactive constants (option lists, fixed enums) can stay as regular fields.

## Animations
- Use **anime.js** for animations only. Do not use it as a general utility library.
- Do not animate via CSS keyframes, Angular animations, or other libraries unless explicitly requested.
