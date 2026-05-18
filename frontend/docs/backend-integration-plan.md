# Frontend ↔ Backend Integration Plan

This document is the executable recipe for wiring the Angular 20 frontend
(`/frontend`) to the Cloudflare Workers + Neon backend (`/backend`). It is
written to be **executed by another Claude Code instance**, not just read.
Every file has a known path. Every file's content is shown in full. Every
PR has a checklist and pass/fail acceptance criteria.

## How to use this plan (for the executing agent)

**Cadence: one checkbox = one commit. Ship ASAP.** The executing agent
optimizes for fast feedback and a moving PR, not for tidy logical
batches.

1. Open §2 (Progress Tracker). Pick the **first unchecked** PR. Branch
   off `main` per its instructions.
2. Open the PR on GitHub **as a draft after your first commit** —
   don't wait for the checklist to be done. A draft PR with one commit
   beats no PR with 20.
3. Jump to the PR's detailed section under §15. Work top to bottom,
   one checklist item at a time.
4. **For each checklist item, make exactly ONE commit that does both:**
   (a) the work for that item, AND (b) flips its `- [ ]` to `- [x]` in
   this doc. The commit message should name the item so the PR history
   reads as a literal walk of the checklist. Push after each commit (or
   every few — push often, never let local-only work accumulate).
5. After any code-touching commit, run `pnpm tsc --noEmit` locally to
   confirm the tree still compiles. If it doesn't, fix it in the next
   commit before continuing — don't proceed on a broken tree.
6. When every box in the PR is ticked, run the PR's full **Validation**
   block. If it passes, flip the draft PR to "ready for review" and
   ping the user. **Do not self-merge** (project memory: confirm
   substantial merges with the user even when they say "merge"). After
   the user merges, tick the PR's box in §2 in a follow-up commit on
   the next branch.
7. Source of truth for DTO shapes is **`/backend/test/*`** and
   **`/backend/src/routes/*`**. If a shape in this plan ever drifts from
   those, the backend wins — fix the DTO file and the plan in the same
   commit.
8. Do **not** ask the user for permission on choices already decided in
   this plan. Do ask if you hit something genuinely undecided.

### Commit message format

```
PR#<N> item: <verb> <short subject>

(optional: 1-2 lines of context if the item isn't self-evident)
```

Examples:
- `PR#1 item: add app/data/utils.ts (toParams helper)`
- `PR#1 item: add app/data/dtos/auth/login-request.dto.ts`
- `PR#2 item: replace AuthGuard class with functional authGuard`
- `PR#4 item: dispatch CreateCustomer from customer-add page`

Each commit is small enough that the title alone explains it. No
co-author trailer needed on intermediate item-commits — keep them
lean. Optionally add the co-author trailer on the final PR-ready
commit (after the full Validation block passes) as a marker.

---

## 1. Architectural decisions (frozen)

These are committed. Don't relitigate.

- **State layer:** NgXs (v19+, standalone `provideStore` API). Auth slice
  persisted via `@ngxs/storage-plugin`. No `localStorage` reads/writes
  outside the storage plugin's own internals.
- **HTTP layer:** `RemoteService` wraps `HttpClient`. One service per
  backend entity under `/src/http/`. Services return `Observable<T>` and
  are called from NgXs `@Action` handlers — not from components.
- **JWT injection:** functional `HttpInterceptorFn` reading
  `AuthState.token` via `store.selectSnapshot`. 401 dispatches `Logout`.
- **DTOs/types:** one `interface` or `type` per file under
  `/src/app/data/` split into three sibling folders (`dtos/`,
  `interfaces/`, `types/`) with per-entity subfolders and per-folder
  `index.ts` barrels.
- **Angular primitives:** under `/src/app/<kind>s/` — `guards/`,
  `interceptors/`, `directives/`, `pipes/`.
- **UI services** (no network, no NgXs state) under `/src/theme/`.
- **No NgRx / Akita / Signals Store. No SSR. No refresh tokens. No
  request caching layer** (cache lives in state slices instead).

---

## 2. Progress Tracker

> Tick each box when the corresponding PR is **merged to main**. Per-PR
> task checklists live in §15.

- [ ] **PR #1** — Foundation: data folder, RemoteService, NgXs setup, Angular folder layout
- [ ] **PR #2** — Auth migration (login, guard, interceptor, AuthState)
- [ ] **PR #3** — Users HTTP + UsersState
- [ ] **PR #4** — Customers migration
- [ ] **PR #5** — Reports migration
- [ ] **PR #6** — Upload service + image picker wiring
- [ ] **PR #7** — Theme migration + final cleanup

---

## 3. Target folder structure

```
frontend/src/
├── http/
│   ├── remote.service.ts
│   ├── auth.service.ts
│   ├── users.service.ts
│   ├── customers.service.ts
│   ├── reports.service.ts
│   └── upload.service.ts
│
├── state/
│   ├── auth/        { auth.state.ts, auth.actions.ts }
│   ├── customers/   { customers.state.ts, customers.actions.ts }
│   ├── reports/     { reports.state.ts, reports.actions.ts }
│   └── users/       { users.state.ts, users.actions.ts }
│
├── theme/
│   └── toast.service.ts
│
├── app/
│   ├── app.config.ts
│   ├── app.routes.ts
│   ├── data/
│   │   ├── utils.ts                     # shared helpers (toParams, ...)
│   │   ├── dtos/<entity>/*.dto.ts       # wire payload shapes (+ index.ts barrels)
│   │   ├── interfaces/                  # non-wire interfaces (reserved, currently .gitkeep)
│   │   └── types/<entity>/*.type.ts     # domain enums/unions (+ index.ts barrels)
│   ├── guards/
│   │   └── auth-guard.ts
│   ├── interceptors/
│   │   └── auth.interceptor.ts
│   ├── directives/                      # reserved (.gitkeep)
│   ├── pipes/                           # reserved (.gitkeep)
│   ├── components/ ...
│   ├── layouts/ ...
│   ├── pages/ ...
│   └── shared/ ...
│
├── environments/
│   ├── environment.ts
│   └── environment.development.ts
│
└── services/                            # DELETED in PR #7
```

### Categorization rules (decides which of dtos/ vs interfaces/ vs types/)

| Folder | What goes here | Suffix | Examples |
| --- | --- | --- | --- |
| `app/data/dtos/<entity>/` | Anything that represents a wire payload (request body, response body, JWT payload, error response body, embedded wire shape like `ReportData` or `MinisplitData`). **Role-based**, regardless of `interface` vs `type` syntax. | `.dto.ts` | `login-request.dto.ts` (interface), `update-customer-request.dto.ts` (type alias `Partial<...>`), `report-data.dto.ts` (type alias union) |
| `app/data/interfaces/<entity>/` | Non-wire `interface` declarations — internal app contracts not sent over the wire. **Currently empty.** Reserve for future shared component prop shapes, internal models, etc. | `.interface.ts` | (none yet) |
| `app/data/types/<entity>/` | Domain primitive type aliases — enums, simple unions, branded primitives. Used as field values *inside* DTOs, but not themselves a payload. | `.type.ts` | `user-type.type.ts` (`'admin' \| 'technician'`), `report-status.type.ts` |

**Notes:**
- State models (`AuthStateModel`, `CustomersStateModel`, etc.) are NOT in
  `/app/data/` — they live next to their state class, since they describe
  internal slice shape.
- Non-type runtime helpers (e.g. `asApiError`) sit next to the related
  DTO file with no suffix (e.g. `as-api-error.ts`).
- File name is kebab-case of the type name.
- One `export interface` or one `export type` per file (NgXs action
  classes are the documented exception — see §6).

### Barrel files

Every leaf folder has an `index.ts` that re-exports its types via
`export type { ... } from './...';` (pure type re-exports, erased at
compile time). Consumers import from the barrel, never from individual
files.

Examples of consumer imports:
```ts
import type { LoginRequest, LoginResponse } from '../app/data/dtos/auth';
import type { UserType } from '../app/data/types/user';
import { toParams, type Query } from '../app/data/utils';
```

---

## 4. `app/data/utils.ts`

**Create:** `frontend/src/app/data/utils.ts`

```ts
import { HttpParams } from '@angular/common/http';

export type Query = Record<string, string | number | boolean | undefined | null>;

export const toParams = (q?: Query): HttpParams | undefined => {
  if (!q) return undefined;
  let p = new HttpParams();
  for (const [k, v] of Object.entries(q)) {
    if (v === undefined || v === null || v === '') continue;
    p = p.set(k, String(v));
  }
  return p;
};
```

Future shared helpers (e.g. `asApiError`-style narrowing, date parsers
that aren't tied to a single DTO, etc.) go in this same file unless they
grow enough to deserve splitting.

---

## 5. `http/remote.service.ts`

**Create:** `frontend/src/http/remote.service.ts`

```ts
import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../environments/environment';
import { toParams, type Query } from '../app/data/utils';

@Injectable({ providedIn: 'root' })
export class RemoteService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl.replace(/\/$/, '');

  private url(path: string): string {
    return `${this.base}${path.startsWith('/') ? path : `/${path}`}`;
  }

  get<T>(path: string, query?: Query): Observable<T> {
    return this.http.get<T>(this.url(path), { params: toParams(query) });
  }
  post<T>(path: string, body: unknown): Observable<T> {
    return this.http.post<T>(this.url(path), body);
  }
  patch<T>(path: string, body: unknown): Observable<T> {
    return this.http.patch<T>(this.url(path), body);
  }
  put<T>(path: string, body: unknown): Observable<T> {
    return this.http.put<T>(this.url(path), body);
  }
  delete<T>(path: string, body?: unknown): Observable<T> {
    return this.http.request<T>('DELETE', this.url(path), { body });
  }
  postForm<T>(path: string, form: FormData): Observable<T> {
    return this.http.post<T>(this.url(path), form);
  }
  putForm<T>(path: string, form: FormData): Observable<T> {
    return this.http.put<T>(this.url(path), form);
  }
  getBlob(path: string): Observable<Blob> {
    return this.http.get(this.url(path), { responseType: 'blob' });
  }
}
```

RemoteService is **auth-agnostic and state-agnostic** — JWT injection is
the interceptor's job (§7).

---

## 6. NgXs conventions

- **State class:** one per entity at `state/<entity>/<entity>.state.ts`,
  named `<Entity>State`. Has `@State<...>({ name: '<slice>', defaults })`
  and `@Injectable()` decorators.
- **Selectors:** static methods with `@Selector()`. Functional factory
  selectors (e.g. `byId(id)`) are plain static methods returning a
  function.
- **Actions:** plain classes with `static readonly type = '[Slice] Verb'`
  and constructor payload. **Grouped per state in `<entity>.actions.ts`** —
  exempt from the one-per-file rule because action classes are runtime
  constructs (not types) and the NgXs ecosystem expects them grouped.
- **Action handlers:** `@Action(SomeAction) handler(ctx, action)` methods
  on the state class. Return the inner `Observable<T>` from the HTTP call
  via `pipe(tap(...))` so NgXs awaits completion before resolving the
  dispatch.
- **State models** (`<Entity>StateModel`) declared in the same file as
  the state class. Not under `/app/data/`.

---

## 7. AuthState, persistence, interceptor, guard

### 7.1 `state/auth/auth.actions.ts`

```ts
import type { LoginRequest } from '../../app/data/dtos/auth';

export class Login {
  static readonly type = '[Auth] Login';
  constructor(public payload: LoginRequest) {}
}

export class LoadCurrentUser {
  static readonly type = '[Auth] Load Current User';
}

export class Logout {
  static readonly type = '[Auth] Logout';
}
```

### 7.2 `state/auth/auth.state.ts`

```ts
import { Injectable, inject } from '@angular/core';
import { State, Action, Selector, StateContext } from '@ngxs/store';
import { Router } from '@angular/router';
import { switchMap, tap } from 'rxjs/operators';
import { AuthService } from '../../http/auth.service';
import { UsersService } from '../../http/users.service';
import { Login, LoadCurrentUser, Logout } from './auth.actions';
import type { PublicUser } from '../../app/data/dtos/user';
import type { UserType } from '../../app/data/types/user';

export interface AuthStateModel {
  token: string | null;
  user: PublicUser | null;
}

@State<AuthStateModel>({
  name: 'auth',
  defaults: { token: null, user: null },
})
@Injectable()
export class AuthState {
  private readonly auth = inject(AuthService);
  private readonly users = inject(UsersService);
  private readonly router = inject(Router);

  @Selector() static token(s: AuthStateModel): string | null { return s.token; }
  @Selector() static user(s: AuthStateModel): PublicUser | null { return s.user; }
  @Selector() static role(s: AuthStateModel): UserType | null { return s.user?.role ?? null; }
  @Selector() static email(s: AuthStateModel): string | null { return s.user?.email ?? null; }
  @Selector() static isAuthenticated(s: AuthStateModel): boolean { return !!s.token; }

  @Action(Login)
  login(ctx: StateContext<AuthStateModel>, { payload }: Login) {
    return this.auth.login(payload).pipe(
      tap(({ token }) => ctx.patchState({ token })),
      switchMap(() => this.users.me()),
      tap(({ user }) => ctx.patchState({ user })),
    );
  }

  @Action(LoadCurrentUser)
  loadCurrentUser(ctx: StateContext<AuthStateModel>) {
    return this.users.me().pipe(tap(({ user }) => ctx.patchState({ user })));
  }

  @Action(Logout)
  logout(ctx: StateContext<AuthStateModel>) {
    ctx.setState({ token: null, user: null });
    this.router.navigate(['/login']);
  }
}
```

### 7.3 `app/interceptors/auth.interceptor.ts`

```ts
import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Store } from '@ngxs/store';
import { catchError, throwError } from 'rxjs';
import { AuthState } from '../../state/auth/auth.state';
import { Logout } from '../../state/auth/auth.actions';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const store = inject(Store);
  const token = store.selectSnapshot(AuthState.token);
  const authed = token
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;
  return next(authed).pipe(
    catchError((err) => {
      if (err?.status === 401) store.dispatch(new Logout());
      return throwError(() => err);
    }),
  );
};
```

### 7.4 `app/guards/auth-guard.ts`

```ts
import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { Store } from '@ngxs/store';
import { jwtDecode } from 'jwt-decode';
import { AuthState } from '../../state/auth/auth.state';
import { Logout } from '../../state/auth/auth.actions';
import type { JwtPayload } from '../data/dtos/jwt';

export const authGuard: CanActivateFn = () => {
  const store = inject(Store);
  const router = inject(Router);
  const token = store.selectSnapshot(AuthState.token);
  if (!token) return router.parseUrl('/login');
  try {
    const { exp } = jwtDecode<JwtPayload>(token);
    if (exp < Math.floor(Date.now() / 1000)) {
      store.dispatch(new Logout());
      return router.parseUrl('/login');
    }
    return true;
  } catch {
    store.dispatch(new Logout());
    return router.parseUrl('/login');
  }
};
```

---

## 8. Entity states (Customers, Reports, Users)

Pattern shared by all three. Replace `<Entity>` / `<entity>` accordingly.

```ts
export interface <Entity>StateModel {
  entities: Record<string, <EntityRow>>;
  ids: string[];
  selectedId: string | null;
  loading: boolean;
  query?: <EntityListQuery> | null;   // ReportsState only
}
```

Standard selectors: `list`, `selected`, `loading`, factory
`byId(id)`. Standard actions: `Load<Entities>`, `Load<Entity>`,
`Select<Entity>`, `Create<Entity>`, `Update<Entity>`, `Delete<Entity>`.

### 8.1 `state/customers/customers.actions.ts`

```ts
import type { CreateCustomerRequest, UpdateCustomerRequest } from '../../app/data/dtos/customer';

export class LoadCustomers { static readonly type = '[Customers] Load List'; }
export class LoadCustomer { static readonly type = '[Customers] Load One'; constructor(public id: string) {} }
export class SelectCustomer { static readonly type = '[Customers] Select'; constructor(public id: string | null) {} }
export class CreateCustomer { static readonly type = '[Customers] Create'; constructor(public payload: CreateCustomerRequest) {} }
export class UpdateCustomer { static readonly type = '[Customers] Update'; constructor(public id: string, public payload: UpdateCustomerRequest) {} }
export class DeleteCustomer { static readonly type = '[Customers] Delete'; constructor(public id: string) {} }
```

### 8.2 `state/customers/customers.state.ts`

```ts
import { Injectable, inject } from '@angular/core';
import { State, Action, Selector, StateContext } from '@ngxs/store';
import { tap } from 'rxjs/operators';
import { CustomersService } from '../../http/customers.service';
import {
  LoadCustomers, LoadCustomer, SelectCustomer,
  CreateCustomer, UpdateCustomer, DeleteCustomer,
} from './customers.actions';
import type { CustomerRow } from '../../app/data/dtos/customer';

export interface CustomersStateModel {
  entities: Record<string, CustomerRow>;
  ids: string[];
  selectedId: string | null;
  loading: boolean;
}

@State<CustomersStateModel>({
  name: 'customers',
  defaults: { entities: {}, ids: [], selectedId: null, loading: false },
})
@Injectable()
export class CustomersState {
  private readonly api = inject(CustomersService);

  @Selector() static list(s: CustomersStateModel): CustomerRow[] {
    return s.ids.map((id) => s.entities[id]).filter(Boolean);
  }
  @Selector() static selected(s: CustomersStateModel): CustomerRow | null {
    return s.selectedId ? s.entities[s.selectedId] ?? null : null;
  }
  @Selector() static loading(s: CustomersStateModel): boolean { return s.loading; }

  static byId(id: string) {
    return (s: CustomersStateModel) => s.entities[id] ?? null;
  }

  @Action(LoadCustomers)
  loadList(ctx: StateContext<CustomersStateModel>) {
    ctx.patchState({ loading: true });
    return this.api.list().pipe(
      tap(({ customers }) => {
        const entities: Record<string, CustomerRow> = {};
        const ids: string[] = [];
        for (const c of customers) { entities[c.id] = c; ids.push(c.id); }
        ctx.patchState({ entities, ids, loading: false });
      }),
    );
  }

  @Action(LoadCustomer)
  loadOne(ctx: StateContext<CustomersStateModel>, { id }: LoadCustomer) {
    return this.api.get(id).pipe(
      tap(({ customer }) => {
        const s = ctx.getState();
        const ids = s.ids.includes(id) ? s.ids : [...s.ids, id];
        ctx.patchState({ entities: { ...s.entities, [id]: customer }, ids });
      }),
    );
  }

  @Action(SelectCustomer)
  select(ctx: StateContext<CustomersStateModel>, { id }: SelectCustomer) {
    ctx.patchState({ selectedId: id });
  }

  @Action(CreateCustomer)
  create(ctx: StateContext<CustomersStateModel>, { payload }: CreateCustomer) {
    return this.api.create(payload).pipe(
      tap(({ customer }) => {
        const s = ctx.getState();
        ctx.patchState({
          entities: { ...s.entities, [customer.id]: customer },
          ids: [...s.ids, customer.id],
        });
      }),
    );
  }

  @Action(UpdateCustomer)
  update(ctx: StateContext<CustomersStateModel>, { id, payload }: UpdateCustomer) {
    return this.api.update(id, payload).pipe(
      tap(({ customer }) => {
        const s = ctx.getState();
        ctx.patchState({ entities: { ...s.entities, [id]: customer } });
      }),
    );
  }

  @Action(DeleteCustomer)
  remove(ctx: StateContext<CustomersStateModel>, { id }: DeleteCustomer) {
    return this.api.remove(id).pipe(
      tap(() => {
        const s = ctx.getState();
        const { [id]: _gone, ...rest } = s.entities;
        ctx.patchState({
          entities: rest,
          ids: s.ids.filter((x) => x !== id),
          selectedId: s.selectedId === id ? null : s.selectedId,
        });
      }),
    );
  }
}
```

### 8.3 `state/reports/`

Same pattern. Extras:
- `query: ReportListQuery | null` in the model; action `SetReportsQuery`.
- `details: Record<string, ReportDetailRow>` slice alongside `entities`.
- Extra actions: `AddSignature`, `AddPictures`, `RemovePictures`,
  `SetAssignee`, `SendReportEmail`, `LoadReportEmails`, `RevokeReportEmail`.
- `LoadReport` populates BOTH `entities[id]` and `details[id]` from the
  `ReportResponse`.
- `LoadReports` only populates `entities` (the list endpoint returns
  `ReportRow[]`, not details).

### 8.4 `state/users/`

Same pattern. Extras:
- `me: PublicUser | null` slice + `LoadMe` action wrapping
  `UsersService.me()`. Note: `AuthState.user` already holds the current
  user; `UsersState.me` is only used if admin pages need it separately.
  Default: read from `AuthState.user`. Add `UsersState.me` only if a real
  use case appears.
- Admin-only mutations: `CreateUser`, `UpdateUser`, `DeleteUser`.

---

## 9. `app/app.config.ts`

**Update:** `frontend/src/app/app.config.ts` — replace entire file.

```ts
import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
  isDevMode,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideStore } from '@ngxs/store';
import { withNgxsStoragePlugin } from '@ngxs/storage-plugin';
import { withNgxsReduxDevtoolsPlugin } from '@ngxs/devtools-plugin';
import { withNgxsLoggerPlugin } from '@ngxs/logger-plugin';
import { routes } from './app.routes';
import { authInterceptor } from './interceptors/auth.interceptor';
import { AuthState } from '../state/auth/auth.state';
import { UsersState } from '../state/users/users.state';
import { CustomersState } from '../state/customers/customers.state';
import { ReportsState } from '../state/reports/reports.state';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideHttpClient(withInterceptors([authInterceptor])),
    provideRouter(routes),
    provideStore(
      [AuthState, UsersState, CustomersState, ReportsState],
      withNgxsStoragePlugin({ keys: ['auth'] }),
      withNgxsReduxDevtoolsPlugin({ disabled: !isDevMode() }),
      withNgxsLoggerPlugin({ disabled: !isDevMode() }),
    ),
  ],
};
```

Diff from current: removes `importProvidersFrom(HttpClientModule)` (deprecated),
adds `withInterceptors([authInterceptor])`, adds the entire `provideStore(...)`
block.

---

## 10. Environment files

**Update:** `frontend/src/environments/environment.ts`

```ts
export const environment = {
  production: true,
  apiUrl: 'https://<cloudflare-workers-prod-url>', // fill at deploy time
};
```

**Update:** `frontend/src/environments/environment.development.ts`

```ts
export const environment = {
  production: false,
  apiUrl: 'http://127.0.0.1:8787',
};
```

> If `wrangler dev` uses a non-default port, update the dev URL to match.

---

## 11. Files under `/app/data/` — every file in full

Each block below is one entity folder. Create the files exactly as
shown. The barrel `index.ts` is the last item in each folder.

### 11.1 `app/data/dtos/api-error/`

```ts
// app/data/dtos/api-error/api-error.dto.ts
import type { ReportStatus } from '../../types/report';

export interface ApiError {
  error: string;
  message?: string;
  status?: ReportStatus;
}
```

```ts
// app/data/dtos/api-error/as-api-error.ts
import type { HttpErrorResponse } from '@angular/common/http';
import type { ApiError } from './api-error.dto';

export const asApiError = (e: HttpErrorResponse): ApiError =>
  (e.error && typeof e.error === 'object' ? e.error : { error: 'unknown' }) as ApiError;
```

```ts
// app/data/dtos/api-error/index.ts
export type { ApiError } from './api-error.dto';
export { asApiError } from './as-api-error';
```

### 11.2 `app/data/dtos/auth/`

```ts
// app/data/dtos/auth/login-request.dto.ts
export interface LoginRequest {
  email: string;
  password: string;
}
```

```ts
// app/data/dtos/auth/login-response.dto.ts
export interface LoginResponse {
  token: string;
}
```

```ts
// app/data/dtos/auth/index.ts
export type { LoginRequest } from './login-request.dto';
export type { LoginResponse } from './login-response.dto';
```

### 11.3 `app/data/dtos/jwt/`

```ts
// app/data/dtos/jwt/jwt-payload.dto.ts
import type { UserType } from '../../types/user';

export interface JwtPayload {
  sub: string;
  role: UserType;
  iat: number;
  exp: number;
}
```

```ts
// app/data/dtos/jwt/index.ts
export type { JwtPayload } from './jwt-payload.dto';
```

### 11.4 `app/data/dtos/user/`

```ts
// app/data/dtos/user/public-user.dto.ts
import type { UserType } from '../../types/user';

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: UserType;
  createdAt: string;
  updatedAt: string;
}
```

```ts
// app/data/dtos/user/create-user-request.dto.ts
import type { UserType } from '../../types/user';

export interface CreateUserRequest {
  name: string;
  email: string;
  password: string;
  role: UserType;
}
```

```ts
// app/data/dtos/user/update-user-request.dto.ts
import type { UserType } from '../../types/user';

export interface UpdateUserRequest {
  name?: string;
  email?: string;
  password?: string;
  role?: UserType;
}
```

```ts
// app/data/dtos/user/user-response.dto.ts
import type { PublicUser } from './public-user.dto';

export interface UserResponse {
  user: PublicUser;
}
```

```ts
// app/data/dtos/user/user-list-response.dto.ts
import type { PublicUser } from './public-user.dto';

export interface UserListResponse {
  users: PublicUser[];
}
```

```ts
// app/data/dtos/user/delete-user-response.dto.ts
export interface DeleteUserResponse {
  id: string;
  deleted: true;
}
```

```ts
// app/data/dtos/user/index.ts
export type { PublicUser } from './public-user.dto';
export type { CreateUserRequest } from './create-user-request.dto';
export type { UpdateUserRequest } from './update-user-request.dto';
export type { UserResponse } from './user-response.dto';
export type { UserListResponse } from './user-list-response.dto';
export type { DeleteUserResponse } from './delete-user-response.dto';
```

### 11.5 `app/data/dtos/customer/`

```ts
// app/data/dtos/customer/customer-row.dto.ts
export interface CustomerRow {
  id: string;
  name: string;
  identification: string | null;
  phone: string | null;
  email: string | null;
  observation: string | null;
  createdAt: string;
  updatedAt: string;
}
```

```ts
// app/data/dtos/customer/create-customer-request.dto.ts
export interface CreateCustomerRequest {
  name: string;
  identification?: string;
  phone?: string;
  email?: string;
  observation?: string;
}
```

```ts
// app/data/dtos/customer/update-customer-request.dto.ts
import type { CreateCustomerRequest } from './create-customer-request.dto';

export type UpdateCustomerRequest = Partial<CreateCustomerRequest>;
```

```ts
// app/data/dtos/customer/customer-response.dto.ts
import type { CustomerRow } from './customer-row.dto';

export interface CustomerResponse {
  customer: CustomerRow;
}
```

```ts
// app/data/dtos/customer/customer-list-response.dto.ts
import type { CustomerRow } from './customer-row.dto';

export interface CustomerListResponse {
  customers: CustomerRow[];
}
```

```ts
// app/data/dtos/customer/delete-customer-response.dto.ts
export interface DeleteCustomerResponse {
  id: string;
  deleted: true;
}
```

```ts
// app/data/dtos/customer/index.ts
export type { CustomerRow } from './customer-row.dto';
export type { CreateCustomerRequest } from './create-customer-request.dto';
export type { UpdateCustomerRequest } from './update-customer-request.dto';
export type { CustomerResponse } from './customer-response.dto';
export type { CustomerListResponse } from './customer-list-response.dto';
export type { DeleteCustomerResponse } from './delete-customer-response.dto';
```

### 11.6 `app/data/dtos/report/`

```ts
// app/data/dtos/report/minisplit-data.dto.ts
// snake_case is deliberate — round-trips verbatim through report_details.data (JSONB)
export interface MinisplitData {
  is_operating: boolean;
  remote_working: boolean;
  amperage: string;
  filter: boolean;
  inner_voltage: string;
  unusual_noise: boolean;
  observations: string;
}
```

```ts
// app/data/dtos/report/chiller-data.dto.ts
export interface ChillerData {
  is_operating: boolean;
  inner_temperature: string;
  outer_temperature: string;
  inner_voltage: string;
  plc_keys_working: boolean;
  motor_amperage: string;
  system_pressure_1: string;
  system_pressure_2: string;
  system_pressure_3: string;
  oil_pressure: string;
  oil_level: string;
  flux_switch_working: boolean;
  unusual_noise: boolean;
  observations: string;
}
```

```ts
// app/data/dtos/report/uma-data.dto.ts
export interface UmaData {
  is_operating: boolean;
  air_band_adjustment: boolean;
  inner_temperature: string;
  outer_temperature: string;
  air_good_quality: boolean;
  inner_voltage: string;
  motor_amperage: string;
  unusual_noise: boolean;
  observations: string;
}
```

```ts
// app/data/dtos/report/report-data.dto.ts
import type { MinisplitData } from './minisplit-data.dto';
import type { ChillerData } from './chiller-data.dto';
import type { UmaData } from './uma-data.dto';

export type ReportData = MinisplitData | ChillerData | UmaData;
```

```ts
// app/data/dtos/report/report-row.dto.ts
import type { ReportType, ReportStatus } from '../../types/report';

export interface ReportRow {
  id: string;                  // format: R-YYYYMMDD-NNNN
  reportType: ReportType;
  workType: string | null;
  dateArrival: string | null;
  dateDeparture: string | null;
  createdBy: string;
  assignedTo: string;
  clientId: string;
  signedBy: string | null;
  status: ReportStatus;
  signedAt: string | null;
  finishedAt: string | null;
  mailedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
```

```ts
// app/data/dtos/report/report-detail-row.dto.ts
import type { ReportData } from './report-data.dto';

export interface ReportDetailRow {
  reportId: string;
  data: ReportData;
  pictures: string[];
  signature: string | null;
  contentFilledAt: string | null;
  updatedAt: string;
}
```

```ts
// app/data/dtos/report/report-list-query.dto.ts
import type { ReportStatus } from '../../types/report';

export interface ReportListQuery {
  status?: ReportStatus;
  client_id?: string;
  assigned_to?: string;        // admin-only; technicians auto-scoped
  work_type?: string;
  folio?: string;
  date_from?: string;
  date_to?: string;
}
```

```ts
// app/data/dtos/report/create-report-fields.dto.ts
import type { ReportType } from '../../types/report';
import type { ReportData } from './report-data.dto';

export interface CreateReportFields {
  report_type: ReportType;
  work_type?: string;
  client_id: string;
  date_arrival?: string;
  date_departure?: string;
  assigned_to?: string;        // admin only
  signed_by?: string;
  data: ReportData;            // service serializes to JSON
  pictures?: File[];
  signature?: File;
  signature_base64?: string;
}
```

```ts
// app/data/dtos/report/update-report-request.dto.ts
import type { ReportData } from './report-data.dto';

export interface UpdateReportRequest {
  work_type?: string;
  date_arrival?: string;
  date_departure?: string;
  client_id?: string;
  data?: Partial<ReportData>;
}
```

```ts
// app/data/dtos/report/update-assignee-request.dto.ts
export interface UpdateAssigneeRequest {
  assigned_to: string;
}
```

```ts
// app/data/dtos/report/add-signature-fields.dto.ts
export interface AddSignatureFields {
  signed_by: string;
  signature?: File;
  signature_base64?: string;
}
```

```ts
// app/data/dtos/report/delete-pictures-request.dto.ts
export interface DeletePicturesRequest {
  urls: string[];
}
```

```ts
// app/data/dtos/report/report-response.dto.ts
import type { ReportRow } from './report-row.dto';
import type { ReportDetailRow } from './report-detail-row.dto';

export interface ReportResponse {
  report: ReportRow;
  details: ReportDetailRow;
}
```

```ts
// app/data/dtos/report/report-header-response.dto.ts
import type { ReportRow } from './report-row.dto';

export interface ReportHeaderResponse {
  report: ReportRow;
}
```

```ts
// app/data/dtos/report/report-details-response.dto.ts
import type { ReportDetailRow } from './report-detail-row.dto';

export interface ReportDetailsResponse {
  details: ReportDetailRow;
}
```

```ts
// app/data/dtos/report/report-list-response.dto.ts
import type { ReportRow } from './report-row.dto';

export interface ReportListResponse {
  reports: ReportRow[];
}
```

```ts
// app/data/dtos/report/delete-report-response.dto.ts
export interface DeleteReportResponse {
  id: string;
  deleted: true;
}
```

```ts
// app/data/dtos/report/index.ts
export type { MinisplitData } from './minisplit-data.dto';
export type { ChillerData } from './chiller-data.dto';
export type { UmaData } from './uma-data.dto';
export type { ReportData } from './report-data.dto';
export type { ReportRow } from './report-row.dto';
export type { ReportDetailRow } from './report-detail-row.dto';
export type { ReportListQuery } from './report-list-query.dto';
export type { CreateReportFields } from './create-report-fields.dto';
export type { UpdateReportRequest } from './update-report-request.dto';
export type { UpdateAssigneeRequest } from './update-assignee-request.dto';
export type { AddSignatureFields } from './add-signature-fields.dto';
export type { DeletePicturesRequest } from './delete-pictures-request.dto';
export type { ReportResponse } from './report-response.dto';
export type { ReportHeaderResponse } from './report-header-response.dto';
export type { ReportDetailsResponse } from './report-details-response.dto';
export type { ReportListResponse } from './report-list-response.dto';
export type { DeleteReportResponse } from './delete-report-response.dto';
```

### 11.7 `app/data/dtos/report-email/`

```ts
// app/data/dtos/report-email/report-email-row.dto.ts
export interface ReportEmailRow {
  id: string;
  reportId: string;
  sentBy: string;
  sentAt: string;
  recipientTo: string;
  recipientCc: string[];
  accessToken: string;
  expiresAt: string | null;
  revokedAt: string | null;
  resendMessageId: string | null;
}
```

```ts
// app/data/dtos/report-email/send-report-email-request.dto.ts
export interface SendReportEmailRequest {
  to?: string;
  cc?: string[];
  expiresInDays?: number;       // 1..365
  message?: string;             // <= 2000 chars
}
```

```ts
// app/data/dtos/report-email/send-report-email-response.dto.ts
export interface SendReportEmailResponse {
  emailId: string;
  sentAt: string;
}
```

```ts
// app/data/dtos/report-email/report-email-list-response.dto.ts
import type { ReportEmailRow } from './report-email-row.dto';

export interface ReportEmailListResponse {
  emails: ReportEmailRow[];
}
```

```ts
// app/data/dtos/report-email/revoke-email-response.dto.ts
export interface RevokeEmailResponse {
  id: string;
  revoked: true;
}
```

```ts
// app/data/dtos/report-email/index.ts
export type { ReportEmailRow } from './report-email-row.dto';
export type { SendReportEmailRequest } from './send-report-email-request.dto';
export type { SendReportEmailResponse } from './send-report-email-response.dto';
export type { ReportEmailListResponse } from './report-email-list-response.dto';
export type { RevokeEmailResponse } from './revoke-email-response.dto';
```

### 11.8 `app/data/dtos/upload/`

```ts
// app/data/dtos/upload/upload-image-response.dto.ts
export interface UploadImageResponse {
  url: string;
  key: string;
}
```

```ts
// app/data/dtos/upload/index.ts
export type { UploadImageResponse } from './upload-image-response.dto';
```

### 11.9 `app/data/types/user/`

```ts
// app/data/types/user/user-type.type.ts
export type UserType = 'admin' | 'technician';
```

```ts
// app/data/types/user/index.ts
export type { UserType } from './user-type.type';
```

### 11.10 `app/data/types/report/`

```ts
// app/data/types/report/report-type.type.ts
export type ReportType = 'minisplit' | 'chiller' | 'uma';
```

```ts
// app/data/types/report/report-status.type.ts
// Lifecycle:
//   created → in-progress (auto on first PATCH or picture upload)
//   → finished (after signature; locked)
//   → mailed (auto after first email send; locked)
// Editable statuses: 'created', 'in-progress'.
export type ReportStatus =
  | 'created'
  | 'in-progress'
  | 'finished'
  | 'mailed';
```

```ts
// app/data/types/report/index.ts
export type { ReportType } from './report-type.type';
export type { ReportStatus } from './report-status.type';
```

### 11.11 `app/data/interfaces/` and reserved folders

Create empty folders with `.gitkeep`:
- `frontend/src/app/data/interfaces/.gitkeep`
- `frontend/src/app/directives/.gitkeep`
- `frontend/src/app/pipes/.gitkeep`

---

## 12. HTTP services

### 12.1 `http/auth.service.ts`

```ts
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { RemoteService } from './remote.service';
import type { LoginRequest, LoginResponse } from '../app/data/dtos/auth';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly remote = inject(RemoteService);

  login(body: LoginRequest): Observable<LoginResponse> {
    return this.remote.post<LoginResponse>('/auth/login', body);
  }
}
```

### 12.2 `http/users.service.ts`

```ts
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { RemoteService } from './remote.service';
import type {
  CreateUserRequest, UpdateUserRequest,
  UserResponse, UserListResponse, DeleteUserResponse,
} from '../app/data/dtos/user';

@Injectable({ providedIn: 'root' })
export class UsersService {
  private readonly remote = inject(RemoteService);

  me(): Observable<UserResponse> { return this.remote.get<UserResponse>('/users/me'); }
  list(): Observable<UserListResponse> { return this.remote.get<UserListResponse>('/users/list'); }
  get(id: string): Observable<UserResponse> { return this.remote.get<UserResponse>(`/users/${id}`); }
  create(body: CreateUserRequest): Observable<UserResponse> { return this.remote.post<UserResponse>('/users', body); }
  update(id: string, body: UpdateUserRequest): Observable<UserResponse> { return this.remote.patch<UserResponse>(`/users/${id}`, body); }
  remove(id: string): Observable<DeleteUserResponse> { return this.remote.delete<DeleteUserResponse>(`/users/${id}`); }
}
```

### 12.3 `http/customers.service.ts`

```ts
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { RemoteService } from './remote.service';
import type {
  CreateCustomerRequest, UpdateCustomerRequest,
  CustomerResponse, CustomerListResponse, DeleteCustomerResponse,
} from '../app/data/dtos/customer';

@Injectable({ providedIn: 'root' })
export class CustomersService {
  private readonly remote = inject(RemoteService);

  list(): Observable<CustomerListResponse> { return this.remote.get<CustomerListResponse>('/customers'); }
  get(id: string): Observable<CustomerResponse> { return this.remote.get<CustomerResponse>(`/customers/${id}`); }
  create(body: CreateCustomerRequest): Observable<CustomerResponse> { return this.remote.post<CustomerResponse>('/customers', body); }
  update(id: string, body: UpdateCustomerRequest): Observable<CustomerResponse> { return this.remote.patch<CustomerResponse>(`/customers/${id}`, body); }
  remove(id: string): Observable<DeleteCustomerResponse> { return this.remote.delete<DeleteCustomerResponse>(`/customers/${id}`); }
}
```

### 12.4 `http/reports.service.ts`

```ts
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { RemoteService } from './remote.service';
import type {
  ReportListQuery,
  CreateReportFields, UpdateReportRequest, UpdateAssigneeRequest,
  AddSignatureFields, DeletePicturesRequest,
  ReportResponse, ReportHeaderResponse, ReportDetailsResponse,
  ReportListResponse, DeleteReportResponse,
} from '../app/data/dtos/report';
import type {
  SendReportEmailRequest, SendReportEmailResponse,
  ReportEmailListResponse, RevokeEmailResponse,
} from '../app/data/dtos/report-email';

const appendIf = (fd: FormData, k: string, v: unknown): void => {
  if (v === undefined || v === null || v === '') return;
  fd.set(k, v as string | Blob);
};

@Injectable({ providedIn: 'root' })
export class ReportsService {
  private readonly remote = inject(RemoteService);

  list(query?: ReportListQuery): Observable<ReportListResponse> {
    return this.remote.get<ReportListResponse>('/reports', query);
  }
  get(id: string): Observable<ReportResponse> {
    return this.remote.get<ReportResponse>(`/reports/${id}`);
  }
  create(fields: CreateReportFields): Observable<ReportResponse> {
    const fd = new FormData();
    appendIf(fd, 'report_type', fields.report_type);
    appendIf(fd, 'work_type', fields.work_type);
    appendIf(fd, 'client_id', fields.client_id);
    appendIf(fd, 'date_arrival', fields.date_arrival);
    appendIf(fd, 'date_departure', fields.date_departure);
    appendIf(fd, 'assigned_to', fields.assigned_to);
    appendIf(fd, 'signed_by', fields.signed_by);
    fd.set('data', JSON.stringify(fields.data));
    for (const pic of fields.pictures ?? []) fd.append('pictures', pic);
    appendIf(fd, 'signature', fields.signature);
    appendIf(fd, 'signature_base64', fields.signature_base64);
    return this.remote.postForm<ReportResponse>('/reports', fd);
  }
  update(id: string, body: UpdateReportRequest): Observable<ReportResponse> {
    return this.remote.patch<ReportResponse>(`/reports/${id}`, body);
  }
  setAssignee(id: string, body: UpdateAssigneeRequest): Observable<ReportHeaderResponse> {
    return this.remote.put<ReportHeaderResponse>(`/reports/${id}/assignee`, body);
  }
  addSignature(id: string, fields: AddSignatureFields): Observable<ReportResponse> {
    const fd = new FormData();
    fd.set('signed_by', fields.signed_by);
    appendIf(fd, 'signature', fields.signature);
    appendIf(fd, 'signature_base64', fields.signature_base64);
    return this.remote.putForm<ReportResponse>(`/reports/${id}/signature`, fd);
  }
  addPictures(id: string, pictures: File[]): Observable<ReportDetailsResponse> {
    const fd = new FormData();
    for (const pic of pictures) fd.append('pictures', pic);
    return this.remote.putForm<ReportDetailsResponse>(`/reports/${id}/pictures`, fd);
  }
  removePictures(id: string, body: DeletePicturesRequest): Observable<ReportDetailsResponse> {
    return this.remote.delete<ReportDetailsResponse>(`/reports/${id}/pictures`, body);
  }
  remove(id: string): Observable<DeleteReportResponse> {
    return this.remote.delete<DeleteReportResponse>(`/reports/${id}`);
  }
  sendEmail(id: string, body: SendReportEmailRequest): Observable<SendReportEmailResponse> {
    return this.remote.post<SendReportEmailResponse>(`/reports/${id}/email`, body);
  }
  listEmails(id: string): Observable<ReportEmailListResponse> {
    return this.remote.get<ReportEmailListResponse>(`/reports/${id}/emails`);
  }
  revokeEmail(emailId: string): Observable<RevokeEmailResponse> {
    return this.remote.post<RevokeEmailResponse>(`/reports/emails/${emailId}/revoke`, {});
  }
  downloadByToken(token: string): Observable<Blob> {
    return this.remote.getBlob(`/reports/download/${token}`);
  }
}
```

### 12.5 `http/upload.service.ts`

```ts
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { RemoteService } from './remote.service';
import type { UploadImageResponse } from '../app/data/dtos/upload';

@Injectable({ providedIn: 'root' })
export class UploadService {
  private readonly remote = inject(RemoteService);

  uploadImage(file: File): Observable<UploadImageResponse> {
    const fd = new FormData();
    fd.set('file', file);
    return this.remote.postForm<UploadImageResponse>('/upload/image', fd);
  }
}
```

---

## 13. Theme services

### `theme/toast.service.ts`

Move `frontend/src/services/toast.service.ts` to
`frontend/src/theme/toast.service.ts` **verbatim** (no code change).
Update all importers to point at the new path.

---

## 14. Pre-existing files: delete / update inventory

### 14.1 DELETE

| Path | Reason |
| --- | --- |
| `frontend/src/app/auth/auth-guard.ts` | Replaced by `app/guards/auth-guard.ts` |
| `frontend/src/app/auth/` (empty folder) | No other contents |
| `frontend/src/services/customers.ts` | Replaced by `http/customers.service.ts` + `CustomersState` |
| `frontend/src/services/reports.ts` | Replaced by `http/reports.service.ts` + `ReportsState` |
| `frontend/src/services/toast.service.ts` | Moved to `theme/toast.service.ts` |
| `frontend/src/services/` (empty folder) | All contents moved |
| Inline `JwtPayload` in `app/pages/customer-add/customer-add.ts` | Use `from '../../data/dtos/jwt'` |
| Inline `JwtPayload` in `app/pages/report-add/report-add.ts` | Same |
| Inline `Customer` interface in `services/customers.ts` (file is being deleted anyway) | Use `CustomerRow` from DTOs |
| `importProvidersFrom(HttpClientModule)` in `app.config.ts` | Deprecated |
| `console.log` calls in old `auth-guard.ts` (file being deleted anyway) | — |
| Any `https://manttio.vercel.app/api/` string | Replaced by CF Workers URL in env files |
| Any `localStorage.getItem('token' \| 'role' \| 'email')` or matching setters/removers outside `@ngxs/storage-plugin`'s internals | NgXs is the only persistence layer |

### 14.2 UPDATE (touched by various PRs)

| Path | Change |
| --- | --- |
| `frontend/package.json` | Add `@ngxs/store`, `@ngxs/storage-plugin`, `@ngxs/devtools-plugin`, `@ngxs/logger-plugin` |
| `frontend/src/app/app.config.ts` | See §9 |
| `frontend/src/app/app.routes.ts` | Replace `canActivate: [AuthGuard]` (class) with `canActivate: [authGuard]` (function); import from `./guards/auth-guard` |
| `frontend/src/environments/environment.ts` | See §10 |
| `frontend/src/environments/environment.development.ts` | See §10 |
| `frontend/src/app/pages/login/*` | Dispatch `new Login({ email, password })`; remove direct HttpClient calls and any `localStorage.setItem` |
| `frontend/src/app/pages/register/*` | Dispatch `new CreateUser(payload)`; remove direct HttpClient/fetch |
| `frontend/src/app/pages/customer-add/customer-add.ts` | Dispatch `new CreateCustomer(payload)`; remove inline `JwtPayload`; remove `localStorage` reads (use `select(AuthState.user)`) |
| `frontend/src/app/pages/reports/*` | Dispatch `new SetReportsQuery(filter)` + `new LoadReports()`; select `ReportsState.list` and `.loading` |
| `frontend/src/app/pages/report-add/report-add.ts` | Dispatch `new CreateReport(fields)`; remove inline `JwtPayload`; remove manual FormData building |
| `frontend/src/app/pages/report-detail/*` | Dispatch `LoadReport`, `UpdateReport`, `AddSignature`, `AddPictures`, `RemovePictures`, `SendReportEmail`; select `ReportsState.byId(id)` and details |
| `frontend/src/app/shared/bottom-nav/*` | Read `select(AuthState.role)` / `select(AuthState.email)`; logout dispatches `new Logout()` |

### 14.3 Wire/data behavioral changes the executor must notice

- **`Customer` field nullability:** `identification`, `phone`, `email`,
  `observation` are now `string | null`. Narrow before rendering.
- **Role storage value:** legacy `localStorage` stored `'true'/'false'`
  (meaning `is_admin`). New value lives at `AuthState.user.role` and is
  `'admin' \| 'technician'`. No compatibility shim.
- **Login response:** new backend returns only `{ token }`. The `Login`
  action handler does the two-step flow (login → `/users/me` → store
  user).
- **`ReportData` is discriminated by `reportType`:** narrow before
  reading specific fields:
  ```ts
  if (report.reportType === 'minisplit') {
    const d = details.data as MinisplitData;
  }
  ```

---

## 15. PR Roadmap

Each PR below has: **Goal**, **Checklist** (tick items as you do them
and commit), **Validation** (must all pass before merging), and
optional **Notes**.

Branch off `main` each time. PR title format:
`<verb> <area>: <one-line summary>`.

---

### PR #1 — Foundation: data folder, RemoteService, NgXs setup, Angular folder layout

**Goal:** Scaffolding complete. App still compiles and runs unchanged
for the user (existing `services/customers.ts`, `services/reports.ts`
keep working). NgXs is wired but no state has handlers yet.

**Checklist:**
- [x] Branch: `git checkout -b feature/frontend-hono-backend-integration`
- [x] `cd frontend && pnpm add @ngxs/store @ngxs/storage-plugin @ngxs/devtools-plugin @ngxs/logger-plugin`
- [ ] Create folder `frontend/src/app/data/`
- [x] Create `frontend/src/app/data/utils.ts` per §4
- [x] Create `frontend/src/app/data/interfaces/.gitkeep`
- [x] Create all files under `frontend/src/app/data/dtos/api-error/` per §11.1
- [x] Create all files under `frontend/src/app/data/dtos/auth/` per §11.2
- [x] Create all files under `frontend/src/app/data/dtos/jwt/` per §11.3
- [x] Create all files under `frontend/src/app/data/dtos/user/` per §11.4
- [x] Create all files under `frontend/src/app/data/dtos/customer/` per §11.5
- [x] Create all files under `frontend/src/app/data/dtos/report/` per §11.6
- [x] Create all files under `frontend/src/app/data/dtos/report-email/` per §11.7
- [x] Create all files under `frontend/src/app/data/dtos/upload/` per §11.8
- [x] Create all files under `frontend/src/app/data/types/user/` per §11.9
- [x] Create all files under `frontend/src/app/data/types/report/` per §11.10
- [x] Create `frontend/src/http/remote.service.ts` per §5
- [ ] Create empty state skeletons (state class + actions, no `@Action` handler bodies — the action classes exist, the state has the `@State` decorator and selectors but each `@Action` handler is `return ctx;` or omitted for now):
  - [x] `frontend/src/state/auth/auth.actions.ts` per §7.1
  - [x] `frontend/src/state/auth/auth.state.ts` — copy §7.2 but stub the handlers (no HTTP calls yet, since auth.service.ts is added in PR #2). Acceptable: have the state class compile with selectors only and action handlers as no-ops.
  - [x] `frontend/src/state/users/users.actions.ts` — minimal: `LoadCurrentUser` only
  - [x] `frontend/src/state/users/users.state.ts` — minimal state, no handler bodies
  - [x] `frontend/src/state/customers/customers.actions.ts` per §8.1
  - [x] `frontend/src/state/customers/customers.state.ts` — copy §8.2 but stub handlers (no HTTP)
  - [x] `frontend/src/state/reports/reports.actions.ts` — declare all action classes per §8.3
  - [x] `frontend/src/state/reports/reports.state.ts` — minimal state, stub handlers
- [ ] Create folder `frontend/src/app/guards/` (empty for now — guard arrives in PR #2)
- [ ] Create `frontend/src/app/interceptors/auth.interceptor.ts` per §7.3
- [ ] Create `frontend/src/app/directives/.gitkeep`
- [ ] Create `frontend/src/app/pipes/.gitkeep`
- [ ] Update `frontend/src/app/app.config.ts` per §9
- [ ] Update `frontend/src/environments/environment.ts` per §10 — set production URL (or leave the placeholder string and add a TODO comment; PR can still merge with the placeholder if production URL isn't decided)
- [ ] Update `frontend/src/environments/environment.development.ts` per §10
- [ ] **Tick this PR's box** in §2 of this doc and commit the doc update

**Validation:**
```bash
cd frontend
pnpm tsc --noEmit            # must pass
pnpm build                   # must pass
```
Manual smoke: `pnpm start`, open app, log in via the **existing** code
path. App still works because PR #1 didn't migrate any callers.

In browser DevTools → Application → Local Storage, the
`@ngxs/storage-plugin` key (default: `@@STATE` or similar) appears once
the user logs in. (Note: PR #1 doesn't migrate login yet, so this
verification only confirms the plugin is loaded. Real persistence
verification happens in PR #2.)

**Notes:**
- Action handler stubs in this PR are intentional — they unblock the
  state-class scaffolding without requiring HTTP services to exist yet.
  PR #2 onwards fills them in.
- DO NOT delete `frontend/src/services/*` in this PR.
- DO NOT touch `frontend/src/app/auth/auth-guard.ts` in this PR.

---

### PR #2 — Auth migration

**Goal:** Login, logout, guard, and interceptor all run through
NgXs/AuthState. No `localStorage.getItem('token' | 'role' | 'email')`
remains anywhere outside the storage plugin's internals.

**Checklist:**
- [ ] Branch: `git checkout -b feature/frontend-auth-migration`
- [ ] Create `frontend/src/http/auth.service.ts` per §12.1
- [ ] Create `frontend/src/http/users.service.ts` per §12.2 (full surface — not just `me()`)
- [ ] Replace `frontend/src/state/auth/auth.state.ts` with the full version per §7.2 (handlers filled in)
- [ ] Replace `frontend/src/state/users/users.state.ts` with the full version implementing at least `me()` action; remaining handlers can stay stubbed until PR #3
- [ ] Create `frontend/src/app/guards/auth-guard.ts` per §7.4
- [ ] Update `frontend/src/app/app.routes.ts`: replace `canActivate: [AuthGuard]` (class) with `canActivate: [authGuard]` (function); update the import to `from './guards/auth-guard'`
- [ ] Delete `frontend/src/app/auth/auth-guard.ts`
- [ ] Delete `frontend/src/app/auth/` (folder) if empty
- [ ] Update login page (`frontend/src/app/pages/login/*`): dispatch `new Login({ email, password })`. On success (action observable completes), navigate to `/home`. Remove direct HttpClient calls. Remove `localStorage.setItem('token' | 'role' | 'email', ...)`.
- [ ] Update register page (`frontend/src/app/pages/register/*`): dispatch `new CreateUser(payload)`. On success, optionally auto-login by dispatching `new Login(...)`. Remove direct HttpClient.
- [ ] Update bottom-nav (`frontend/src/app/shared/bottom-nav/*`): read `select(AuthState.role)` and `select(AuthState.email)`; logout button dispatches `new Logout()`. Remove `localStorage.getItem`.
- [ ] Grep for stray `localStorage.getItem('token' | 'role' | 'email')` calls across `frontend/src/app/**` and replace each:
  - For `'token'`: use `inject(Store).selectSnapshot(AuthState.token)` (or `select` for reactive contexts)
  - For `'role'`: use `select(AuthState.role)`
  - For `'email'`: use `select(AuthState.email)`
- [ ] **Tick this PR's box** in §2 and commit

**Validation:**
```bash
cd frontend
pnpm tsc --noEmit
pnpm build
grep -rn "localStorage.getItem('token'\|localStorage.getItem(\"token\"" frontend/src/
grep -rn "localStorage.setItem('token'\|localStorage.setItem(\"token\"" frontend/src/
grep -rn "localStorage.getItem('role'\|localStorage.getItem('email'" frontend/src/
# All four greps should return zero matches.
```
Manual: log in. DevTools → Application → Local Storage shows the
`@ngxs/storage-plugin` entry containing `auth` slice with `token` and
`user`. Refresh the page — user stays logged in, redirected to /home,
bottom-nav shows correct email/role. Click logout — storage cleared,
redirected to /login.

---

### PR #3 — Users HTTP + UsersState (admin)

**Goal:** Full CRUD on users through state. If an admin users page
exists, it works; if not, the actions are still ready for future use.

**Checklist:**
- [ ] Branch: `git checkout -b feature/frontend-users-state`
- [ ] Expand `frontend/src/state/users/users.actions.ts` to include `LoadUsers`, `LoadUser`, `CreateUser`, `UpdateUser`, `DeleteUser` (in addition to `LoadCurrentUser` from PR #2).
- [ ] Implement all handlers in `frontend/src/state/users/users.state.ts`. Selectors: `list`, `selected`, `byId(id)`, `loading`, `me` (mirrors AuthState.user, or omit if not needed).
- [ ] If an admin users page exists under `frontend/src/app/pages/`, migrate it to dispatch + select. Otherwise skip.
- [ ] **Tick this PR's box** in §2 and commit

**Validation:**
```bash
cd frontend
pnpm tsc --noEmit
pnpm build
```
Manual: if migrated UI exists, click through create/edit/delete user as
admin. Each action should round-trip through the state.

---

### PR #4 — Customers migration

**Goal:** All customer reads and writes go through `CustomersState`. Old
`services/customers.ts` deleted.

**Checklist:**
- [ ] Branch: `git checkout -b feature/frontend-customers-migration`
- [ ] Replace `frontend/src/state/customers/customers.state.ts` with the full version per §8.2
- [ ] Update `frontend/src/app/pages/customer-add/customer-add.ts`:
  - [ ] Dispatch `new CreateCustomer(payload)` on submit
  - [ ] Remove `import { CustomersService }` and direct HttpClient usage
  - [ ] Remove inline `JwtPayload` declaration; import from `from '../../data/dtos/jwt'` if needed
  - [ ] Replace any `localStorage.getItem('email')` with `select(AuthState.email)`
- [ ] Update any customer list view (likely embedded in reports or customers page): dispatch `new LoadCustomers()` on init, `select(CustomersState.list)` for the rendered list
- [ ] Replace any `import { Customer } from '../../services/customers'` with `import type { CustomerRow } from '../app/data/dtos/customer'` (note the type name change). Audit all callsites for null narrowing on `identification|phone|email|observation`.
- [ ] Delete `frontend/src/services/customers.ts`
- [ ] **Tick this PR's box** in §2 and commit

**Validation:**
```bash
cd frontend
pnpm tsc --noEmit
pnpm build
test ! -f frontend/src/services/customers.ts && echo OK
grep -rn "from '.*services/customers'" frontend/src/ || echo "no stale imports"
```
Manual: list customers (renders from state), create a customer (appears
in list without manual refresh), edit, delete.

---

### PR #5 — Reports migration

**Goal:** All report flows go through `ReportsState`. Old
`services/reports.ts` deleted.

**Checklist:**
- [ ] Branch: `git checkout -b feature/frontend-reports-migration`
- [ ] Implement full `frontend/src/state/reports/reports.actions.ts`: `LoadReports`, `LoadReport`, `SelectReport`, `SetReportsQuery`, `CreateReport`, `UpdateReport`, `SetAssignee`, `AddSignature`, `AddPictures`, `RemovePictures`, `DeleteReport`, `SendReportEmail`, `LoadReportEmails`, `RevokeReportEmail`.
- [ ] Implement full `frontend/src/state/reports/reports.state.ts`:
  - Model: `{ entities: Record<string, ReportRow>, details: Record<string, ReportDetailRow>, ids: string[], selectedId: string | null, query: ReportListQuery | null, loading: boolean, emails: Record<string, ReportEmailRow[]> }`
  - Selectors: `list`, `selected` (combined `{ report, details }`), `byId(id)`, `detailsById(id)`, `emailsForReport(id)`, `loading`, `query`
  - Handlers per the action list
- [ ] Update reports list page (`frontend/src/app/pages/reports/*`):
  - Bind filter inputs to dispatch `new SetReportsQuery(...)` + `new LoadReports()`
  - Render `select(ReportsState.list)`, show spinner from `select(ReportsState.loading)`
- [ ] Update report-add (`frontend/src/app/pages/report-add/report-add.ts`):
  - Build `CreateReportFields` object from form state; dispatch `new CreateReport(fields)`
  - Remove inline `FormData` building (the service does it now)
  - Remove inline `JwtPayload`
- [ ] Update report-detail (`frontend/src/app/pages/report-detail/*`):
  - On init, dispatch `new LoadReport(id)`; bind to `select(ReportsState.byId(id))` and `detailsById(id)`
  - Edit form submit: `new UpdateReport(id, payload)`
  - Signature submit: `new AddSignature(id, fields)`
  - Picture upload: `new AddPictures(id, files)`
  - Picture delete: `new RemovePictures(id, { urls })`
  - Send email: `new SendReportEmail(id, payload)`
  - Type-narrow on `reportType` before reading `data.X` fields (see §14.3)
- [ ] Delete `frontend/src/services/reports.ts`
- [ ] **Tick this PR's box** in §2 and commit

**Validation:**
```bash
cd frontend
pnpm tsc --noEmit
pnpm build
test ! -f frontend/src/services/reports.ts && echo OK
grep -rn "from '.*services/reports'" frontend/src/ || echo "no stale imports"
```
Manual: list reports with various filters, open one, edit it, sign it,
add/remove pictures, send email.

---

### PR #6 — Upload service + image picker wiring

**Goal:** Standalone image uploads (outside the report creation flow)
flow through `UploadService`.

**Checklist:**
- [ ] Branch: `git checkout -b feature/frontend-upload`
- [ ] Create `frontend/src/http/upload.service.ts` per §12.5
- [ ] Audit `frontend/src/app/components/image-picker/*`: if it uploads images standalone, replace direct HttpClient with `inject(UploadService).uploadImage(file)`. If it only collects File objects for the parent component to submit with the report, no change needed.
- [ ] **Tick this PR's box** in §2 and commit

**Validation:**
```bash
cd frontend
pnpm tsc --noEmit
pnpm build
```
Manual: if image-picker was migrated, exercise its upload flow.

---

### PR #7 — Theme migration + final cleanup

**Goal:** `/services/` folder deleted. No `localStorage` reads/writes
outside storage plugin. No old Vercel URL references. Doc fully ticked.

**Checklist:**
- [ ] Branch: `git checkout -b feature/frontend-theme-cleanup`
- [ ] Create folder `frontend/src/theme/`
- [ ] Move `frontend/src/services/toast.service.ts` → `frontend/src/theme/toast.service.ts` (content unchanged)
- [ ] Update every importer:
      `grep -rln "from '.*services/toast.service'" frontend/src/` and rewrite each path to point at `theme/toast.service`
- [ ] Delete `frontend/src/services/` folder (must be empty after move)
- [ ] Remove any remaining `console.log` debug calls left over from PR #2 in the new guard if any slipped in
- [ ] **Tick this PR's box** in §2 and commit

**Validation:**
```bash
cd frontend
pnpm tsc --noEmit
pnpm build
test ! -d frontend/src/services && echo "services dir gone"
grep -rn 'manttio.vercel.app' frontend/   || echo "no vercel refs"
grep -rn "localStorage\." frontend/src/ | grep -v "node_modules\|@ngxs" || echo "no stray localStorage"
```
Manual: full app smoke — login, list customers, list reports, open a
report, edit, sign, send email. All should work end-to-end against the
new backend.

---

## 16. Standards reference (for the executing agent)

### Angular 20

- `inject()` field syntax over constructor DI in services, components,
  guards, interceptors, state classes.
- Functional `HttpInterceptorFn` registered via
  `provideHttpClient(withInterceptors([...]))`. All interceptors live in
  `frontend/src/app/interceptors/`.
- Functional `CanActivateFn` (and similar). All guards live in
  `frontend/src/app/guards/`.
- Angular primitives folder-grouped under `/src/app/<kind>s/`: `guards/`,
  `interceptors/`, `directives/`, `pipes/`. New kind (`resolvers/`, etc.)
  follows the same plural pattern.
- No `HttpClientModule` import (`provideHttpClient` is the only API).
- HTTP services return `Observable<T>`. Don't `.toPromise()` /
  `firstValueFrom` inside services.

### NgXs

- `provideStore([...], ...plugins)` only. No `NgxsModule.forRoot`.
- One `<Entity>State` class per slice; named `name: '<slice>'`.
- Actions in `<entity>.actions.ts`, grouped per state.
- Selectors as static methods with `@Selector()`. Factory selectors are
  plain static methods returning a function.
- Components dispatch and select; never call HTTP services directly for
  entity reads/writes.
- Action handlers return the inner `Observable<T>` so dispatch resolution
  is awaited.
- Persistence: only `auth` slice via `withNgxsStoragePlugin({ keys: ['auth'] })`.

### Files and types

- One `interface` or one `type` per file under `/src/app/data/`.
  Exceptions: NgXs actions (grouped), runtime helpers (sibling `.ts`
  with no suffix).
- File name = kebab-case of the type name.
- Suffix is **role-based**: `.dto.ts` (wire payload), `.type.ts`
  (domain primitive/enum), `.interface.ts` (non-wire shared interface).
- Each leaf folder has an `index.ts` barrel using `export type { ... }`
  for type re-exports and `export { ... }` for runtime helpers.
- Consumers import from the barrel, never from individual files.

---

## 17. FAQ

**Q: I see two ways to express a type — interface vs type alias. Which?**
A: Use whichever the backend shape naturally maps to. Interfaces for
composite shapes (`{ field: string; }`), type aliases for unions /
`Partial<X>` / primitive aliases. The file SUFFIX is decided by ROLE
(wire payload → `.dto.ts`, domain primitive → `.type.ts`),
independently of the interface vs type choice.

**Q: A DTO's type imports another DTO's type. Cross-folder?**
A: Yes — import from the other folder's barrel. Example: in
`report/report-row.dto.ts`, `import type { ReportType, ReportStatus }
from '../../types/report';`.

**Q: Where do `<Entity>StateModel` interfaces go?**
A: Next to the state class in `state/<entity>/<entity>.state.ts`. They
describe internal slice shape and are not wire payloads.

**Q: What if I need an HTTP call that has no corresponding state slice?**
A: Inject the HTTP service directly into the component. The only
canonical example is `ReportsService.downloadByToken(token)` for the
public PDF link.

**Q: When do I split a runtime helper out of `app/data/utils.ts`?**
A: When it has its own DTO neighbor (e.g. `asApiError` lives in
`dtos/api-error/` next to `ApiError`), or when `utils.ts` grows past
~200 lines.

**Q: Backend disagrees with this plan's DTO shape. Which wins?**
A: Backend. Verify in `/backend/test/<entity>.test.ts` and
`/backend/src/routes/<entity>.ts`. Update the DTO file and the plan in
the same PR.

**Q: I see a `.gitkeep`. Can I delete it once the folder has files?**
A: Yes. Once `app/data/interfaces/<entity>/` has real content, delete
its `.gitkeep`. Same for `app/directives/`, `app/pipes/`.

---

*Last updated: 2026-05-16.*
