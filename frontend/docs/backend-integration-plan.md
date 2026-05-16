# Frontend ↔ Backend Integration Plan

This document is the blueprint for wiring the Angular 20 frontend
(`/frontend`) to the new Cloudflare Workers + Neon backend (`/backend`). It is
written for the developer who will execute the migration: every section is
actionable, and every file referenced is either created, updated, or deleted
by a specific PR in the roadmap below.

The plan introduces:
- a single HTTP entry-point (`RemoteService`) wrapping `HttpClient`,
- a functional `authInterceptor` that pins the JWT to outgoing requests,
- a `/http` folder containing one service file per backend entity,
- a `/theme` folder for UI-only services (toasts, future modals, etc.),
- a `/dtos` folder for typed request/response shapes mirroring the backend,
- a `/state` folder housing **NgXs** state classes (auth + per-entity), with
  the auth slice transparently persisted via `@ngxs/storage-plugin`,
- a consistent home for Angular-native primitives (guards, interceptors,
  directives, pipes) under `/app/<kind>s/`.

NgXs is the **only** state-management layer in this project. Components do
not read from `localStorage`, do not subscribe directly to HTTP services for
entity data, and do not own cross-feature state in component fields or
free-standing `BehaviorSubject`s.

---

## 1. Goals

1. **One source of truth per backend entity.** Every endpoint is reached
   through exactly one method in exactly one `/http` service.
2. **One source of truth for application state.** NgXs owns auth + entity
   caches. Components select from the store and dispatch actions; they never
   hold cross-feature state themselves and never touch `localStorage`.
3. **JWT injection happens once.** A functional HTTP interceptor reads the
   token from `AuthState` and adds the `Authorization` header. Components
   and services never build that header.
4. **Typed end-to-end.** Every request, response, action payload, and state
   slice has a named DTO/interface matching the backend. No `any` in HTTP
   signatures or state models.
5. **Angular 20 idiomatic.** `inject()` over constructor DI, functional
   guards/interceptors over class-based equivalents, `provideStore()` over
   `NgxsModule.forRoot()`, no deprecated `HttpClientModule` import.
6. **Friendly for the next developer.** Folder layout is self-explaining,
   file names describe their contents, naming is consistent.

## 2. Non-goals

- No alternative state library (NgRx, Akita, Component Store, Signals
  Store). NgXs is the chosen layer.
- No refresh-token flow. Backend issues a single short-lived JWT; the
  interceptor dispatches `Logout` on 401 and the user is bounced to
  `/login`. (Add later if the backend grows refresh endpoints.)
- No SSR / Universal. Pure SPA.
- No request caching layer. Each call hits the network; results are cached
  in the relevant state slice instead.

---

## 3. Target folder structure

```
frontend/src/
├── http/
│   ├── remote.service.ts             # the wrapper around HttpClient
│   ├── auth.service.ts               # POST /auth/login
│   ├── users.service.ts              # /users/*
│   ├── customers.service.ts          # /customers/*
│   ├── reports.service.ts            # /reports/* (incl. signature, pictures, email, download)
│   └── upload.service.ts             # POST /upload/image
│
├── state/
│   ├── auth/
│   │   ├── auth.state.ts             # @State, selectors, action handlers
│   │   └── auth.actions.ts           # Login, Logout, LoadCurrentUser
│   ├── customers/
│   │   ├── customers.state.ts
│   │   └── customers.actions.ts
│   ├── reports/
│   │   ├── reports.state.ts
│   │   └── reports.actions.ts
│   └── users/
│       ├── users.state.ts
│       └── users.actions.ts
│
├── theme/
│   └── toast.service.ts              # moved from /services/toast.service.ts
│
├── dtos/
│   ├── api-error.type.ts             # ApiError + asApiError helper
│   ├── jwt-payload.type.ts           # JwtPayload (sub, role, exp, iat)
│   ├── auth.dto.ts                   # LoginRequest, LoginResponse
│   ├── user.dto.ts                   # PublicUser, CreateUser*, UpdateUser*, list/single/delete responses
│   ├── user-type.type.ts             # UserType = 'admin' | 'technician'
│   ├── customer.dto.ts               # CustomerRow, Create/UpdateCustomerRequest, list/single/delete responses
│   ├── report.dto.ts                 # ReportRow, ReportDetailRow, CreateReportFields, UpdateReportRequest, ListReportsQuery
│   ├── report-type.type.ts           # ReportType = 'minisplit' | 'chiller' | 'uma'
│   ├── report-status.type.ts         # ReportStatus = 'created' | 'in-progress' | 'finished' | 'mailed'
│   ├── report-data.type.ts           # MinisplitData, ChillerData, UmaData, ReportData (union)
│   ├── report-email.dto.ts           # ReportEmailRow, Send/RevokeEmail DTOs
│   └── upload.dto.ts                 # UploadImageResponse
│
├── app/
│   ├── guards/
│   │   └── auth-guard.ts             # functional CanActivateFn
│   ├── interceptors/
│   │   └── auth.interceptor.ts       # functional HttpInterceptorFn
│   ├── directives/                   # (reserved for future custom directives)
│   ├── pipes/                        # (reserved for future custom pipes)
│   ├── components/ ...
│   ├── layouts/ ...
│   ├── pages/ ...
│   └── shared/ ...
│
├── environments/
│   ├── environment.ts                # production CF Workers URL
│   └── environment.development.ts    # local `wrangler dev` URL, production: false
│
└── services/                         # DELETED after migration (see §12)
```

### Naming conventions

| Pattern | Use for | Example |
| --- | --- | --- |
| `<entity>.service.ts` | HTTP entity services (`/http`) and UI services (`/theme`) | `customers.service.ts`, `toast.service.ts` |
| `<entity>.dto.ts` | Request and response payload interfaces | `customer.dto.ts` |
| `<descriptive-name>.type.ts` | Supporting types: enums, unions, primitives. The filename describes what's inside (not just the entity it relates to) — one primary type per file, file name maps to PascalCase type name. | `user-type.type.ts` → `UserType`; `report-status.type.ts` → `ReportStatus`; `jwt-payload.type.ts` → `JwtPayload` |
| `<entity>.state.ts` | NgXs `@State` class with selectors and action handlers | `auth.state.ts` |
| `<entity>.actions.ts` | NgXs action classes (one per intent) | `customers.actions.ts` |
| `<name>.interceptor.ts` | Functional `HttpInterceptorFn` (in `/app/interceptors/`) | `auth.interceptor.ts` |
| `<name>-guard.ts` | Functional guard (`CanActivateFn`, `CanMatchFn`, etc.) (in `/app/guards/`) | `auth-guard.ts` |

A DTO file may contain multiple related interfaces (request, response, list
response, etc.). A type file should contain a **single primary type** named
to match the filename — if a feature has multiple distinct types (e.g.
`ReportType` and `ReportStatus`), give each its own file. An actions file
groups every action for one state.

### Angular-primitive home

All Angular-native primitives (guards, interceptors, directives, pipes,
resolvers, error handlers) live under `/src/app/<kind>s/` — one folder per
Angular concept, named in the plural. This keeps anything the Angular DI /
router / HttpClient discovers in a predictable location separate from
backend-facing code (`/http`), state (`/state`), and view-model contracts
(`/dtos`).

### Entity naming note

The backend exposes `/customers` and the existing service is
`services/customers.ts`. The plan keeps **`customers`** as the canonical
entity name on the frontend too (not `clients`), so route, DTO, service,
state, and action names line up 1:1. UI copy can still say "Cliente" —
that's a translation concern, not a code-identifier concern.

---

## 4. `RemoteService` — the HTTP wrapper

**Path:** `frontend/src/http/remote.service.ts`

### Responsibilities

- Prepend `environment.apiUrl` to every relative path.
- Expose typed verbs (`get`, `post`, `patch`, `put`, `delete`) returning
  `Observable<T>`.
- Provide a `postForm<T>(path, form: FormData)` / `putForm<T>` for multipart
  uploads.
- Provide a `getBlob(path)` for binary downloads (PDF).
- **Not** read or write the JWT — that's the interceptor's job. RemoteService
  is auth-agnostic and state-agnostic.

### Skeleton

```ts
import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../environments/environment';

type Query = Record<string, string | number | boolean | undefined | null>;

const toParams = (q?: Query): HttpParams | undefined => {
  if (!q) return undefined;
  let p = new HttpParams();
  for (const [k, v] of Object.entries(q)) {
    if (v === undefined || v === null || v === '') continue;
    p = p.set(k, String(v));
  }
  return p;
};

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

---

## 5. `AuthState`, persistence, guard, and interceptor

The auth slice is the foundation: the interceptor reads its token, the guard
checks its expiry, the bottom-nav reads the user's role and email. All other
state slices can be flushed on `Logout`; this one survives a page refresh
because of `@ngxs/storage-plugin`.

### 5.1 `state/auth/auth.actions.ts`

```ts
import type { LoginRequest } from '../../dtos/auth.dto';

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

### 5.2 `state/auth/auth.state.ts`

```ts
import { Injectable, inject } from '@angular/core';
import { State, Action, Selector, StateContext } from '@ngxs/store';
import { Router } from '@angular/router';
import { switchMap, tap } from 'rxjs/operators';
import { AuthService } from '../../http/auth.service';
import { UsersService } from '../../http/users.service';
import { Login, LoadCurrentUser, Logout } from './auth.actions';
import type { PublicUser } from '../../dtos/user.dto';
import type { UserType } from '../../dtos/user-type.type';

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
    return this.users.me().pipe(
      tap(({ user }) => ctx.patchState({ user })),
    );
  }

  @Action(Logout)
  logout(ctx: StateContext<AuthStateModel>) {
    ctx.setState({ token: null, user: null });
    this.router.navigate(['/login']);
  }
}
```

### 5.3 Persistence

`@ngxs/storage-plugin` mirrors the `'auth'` slice to `localStorage` on every
mutation and rehydrates it on bootstrap. Wiring is in `app.config.ts` (§7).
Consumers of auth data only ever see the store — they have no idea
persistence exists.

### 5.4 `auth.interceptor.ts`

**Path:** `frontend/src/app/interceptors/auth.interceptor.ts`

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

  const authedReq = token
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;

  return next(authedReq).pipe(
    catchError((err) => {
      if (err?.status === 401) store.dispatch(new Logout());
      return throwError(() => err);
    }),
  );
};
```

Two behaviors live here on purpose:
- **Token attach:** every outgoing request gets the header if a token is in
  state. The public `GET /reports/download/:token` endpoint ignores the
  header on the server side, so there's no opt-out logic needed.
- **401 dispatch:** any 401 dispatches `Logout`, which clears the auth slice
  (and via the storage plugin, clears localStorage) and routes to `/login`.

### 5.5 `auth-guard.ts` (rewritten as functional)

**Path:** `frontend/src/app/guards/auth-guard.ts`

```ts
import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { Store } from '@ngxs/store';
import { jwtDecode } from 'jwt-decode';
import { AuthState } from '../../state/auth/auth.state';
import { Logout } from '../../state/auth/auth.actions';
import type { JwtPayload } from '../../dtos/jwt-payload.type';

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

Register in `app.routes.ts` via `canActivate: [authGuard]`. The old
class-based `AuthGuard` at `app/auth/auth-guard.ts` is removed and the
`app/auth/` folder deleted (it has no other contents).

---

## 6. Entity states (Customers, Reports, Users)

Every backend entity gets its own NgXs state. The state owns the cache,
exposes selectors components subscribe to, and contains action handlers that
delegate IO to the matching `/http` service. Components never call the HTTP
service directly for entity reads/writes — they dispatch an action and
select from the store.

The shape below is the convention every entity state follows:

```
interface <Entity>StateModel {
  entities: Record<string, <EntityRow>>;   // normalized by id
  ids: string[];                            // insertion order
  selectedId: string | null;                // for detail pages
  loading: boolean;                         // optional, for spinners
  query: <EntityListQuery> | null;          // last query that produced `ids` (reports)
}
```

Selectors expose: `list` (resolved `EntityRow[]` in `ids` order),
`selected` (the entity at `selectedId`), `byId(id)` (factory selector), and
`loading`.

### 6.1 `state/customers/customers.actions.ts`

```ts
import type { CreateCustomerRequest, UpdateCustomerRequest } from '../../dtos/customer.dto';

export class LoadCustomers { static readonly type = '[Customers] Load List'; }
export class LoadCustomer { static readonly type = '[Customers] Load One'; constructor(public id: string) {} }
export class SelectCustomer { static readonly type = '[Customers] Select'; constructor(public id: string | null) {} }
export class CreateCustomer { static readonly type = '[Customers] Create'; constructor(public payload: CreateCustomerRequest) {} }
export class UpdateCustomer { static readonly type = '[Customers] Update'; constructor(public id: string, public payload: UpdateCustomerRequest) {} }
export class DeleteCustomer { static readonly type = '[Customers] Delete'; constructor(public id: string) {} }
```

### 6.2 `state/customers/customers.state.ts` (skeleton)

```ts
import { Injectable, inject } from '@angular/core';
import { State, Action, Selector, StateContext } from '@ngxs/store';
import { tap } from 'rxjs/operators';
import { CustomersService } from '../../http/customers.service';
import {
  LoadCustomers, LoadCustomer, SelectCustomer,
  CreateCustomer, UpdateCustomer, DeleteCustomer,
} from './customers.actions';
import type { CustomerRow } from '../../dtos/customer.dto';

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

### 6.3 `state/reports/`

Same shape, with the addition of:
- A `query: ReportListQuery | null` slice (so the current filter is part of
  state and survives navigation away/back to the list page).
- Actions for the report-specific subresources: `AddSignature`,
  `AddPictures`, `RemovePictures`, `SetAssignee`, `SendReportEmail`,
  `LoadReportEmails`, `RevokeReportEmail`.
- A `details: Record<string, ReportDetailRow>` slice alongside `entities` —
  the list response gives `ReportRow` only; `/reports/:id` gives both
  `report` and `details`. Keep them in separate maps and select them
  together when needed.

### 6.4 `state/users/`

Same shape. Two extra slices:
- `me: PublicUser | null` — the result of `/users/me`. Distinct from the
  admin-only `/users/list` cache because `me` is available to technicians
  too and is what the bottom-nav reads.
- Admin-only mutations (`CreateUser`, `UpdateUser`, `DeleteUser`) live here
  too; non-admins will never dispatch them because their UI doesn't expose
  them.

> **Reusing AuthState.user vs UsersState.me?** AuthState owns the
> currently-logged-in user (persisted, used by the interceptor/guard). The
> `me` slice in UsersState is **not** duplicated — admin pages that list
> users dispatch `LoadUsers` and read from `UsersState.list`; the bottom-nav
> reads `AuthState.user`. No data lives in two slices.

---

## 7. `app.config.ts` — wiring

**Update:** `frontend/src/app/app.config.ts`

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

Changes from current:
- Adds `provideStore([...], withNgxsStoragePlugin(...), ...)`.
- Adds `withInterceptors([authInterceptor])` to `provideHttpClient`.
- Removes `importProvidersFrom(HttpClientModule)` — deprecated.

### 7.1 NgXs packages to install

Add to `frontend/package.json` dependencies (Angular 20 compatible
versions — install the latest of each):

- `@ngxs/store`
- `@ngxs/storage-plugin`
- `@ngxs/devtools-plugin`
- `@ngxs/logger-plugin`

```bash
pnpm add @ngxs/store @ngxs/storage-plugin @ngxs/devtools-plugin @ngxs/logger-plugin
```

> NgXs v19+ ships the standalone `provideStore()` API used above. Earlier
> versions used `NgxsModule.forRoot(...)` which is **not** compatible with
> this plan.

---

## 8. Environment configuration

**Update:** `frontend/src/environments/environment.ts`

```ts
export const environment = {
  production: true,
  apiUrl: 'https://<cloudflare-workers-prod-url>', // fill in at deploy time
};
```

**Update:** `frontend/src/environments/environment.development.ts`

```ts
export const environment = {
  production: false,
  apiUrl: 'http://127.0.0.1:8787', // default `wrangler dev` port
};
```

> The dev URL must match whatever port `pnpm wrangler dev` uses for the
> backend worker. The implementing PR should also document the dev workflow
> in the frontend README: "run `pnpm wrangler dev` in `/backend`, then
> `pnpm start` in `/frontend`."

---

## 9. DTOs and types

This section is the contract. Each interface mirrors a backend response or
request body verbatim. The full backend API catalog is in
[`/backend/test/`](../../backend/test/) — these DTOs are derived directly
from the zod schemas and route handlers there.

### 9.1 `dtos/jwt-payload.type.ts`

```ts
import type { UserType } from './user-type.type';

export interface JwtPayload {
  sub: string;     // user UUID
  role: UserType;
  iat: number;     // epoch seconds
  exp: number;     // epoch seconds
}
```

Replaces three inline duplicate definitions in:
- `app/auth/auth-guard.ts` (which itself moves to `app/guards/auth-guard.ts`)
- `app/pages/customer-add/customer-add.ts`
- `app/pages/report-add/report-add.ts`

### 9.2 `dtos/user-type.type.ts`

```ts
export type UserType = 'admin' | 'technician';
```

> File renamed from `user.type.ts` for self-explanation, and the contained
> type renamed from `UserRole` to `UserType` so the filename and the export
> agree. The backend JSON wire field stays `role` — the field name and the
> type name are intentionally different (the field describes the *attribute*
> on the user; the type describes the *taxonomy*).

### 9.3 `dtos/user.dto.ts`

```ts
import type { UserType } from './user-type.type';

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: UserType;
  createdAt: string;   // ISO datetime
  updatedAt: string;   // ISO datetime
}

export interface CreateUserRequest {
  name: string;
  email: string;
  password: string;    // min 8 chars
  role: UserType;
}

export interface UpdateUserRequest {
  name?: string;
  email?: string;
  password?: string;
  role?: UserType;
}

export interface UserResponse { user: PublicUser; }
export interface UserListResponse { users: PublicUser[]; }
export interface DeleteUserResponse { id: string; deleted: true; }
```

### 9.4 `dtos/auth.dto.ts`

```ts
export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  token: string;
}
```

> Note: the backend's `/auth/login` returns **only** `{ token }`. The current
> frontend assumes a `{ token, user: { role, email } }` shape — that came
> from the old Vercel backend and must be removed. The new flow is the
> `Login` action in `AuthState` (§5.2): POST `/auth/login` → store token →
> GET `/users/me` → store user. Components only ever dispatch `Login` and
> select from `AuthState`.

### 9.5 `dtos/customer.dto.ts`

```ts
export interface CustomerRow {
  id: string;
  name: string;
  identification: string | null;
  phone: string | null;
  email: string | null;
  observation: string | null;
  createdAt: string;   // ISO datetime
  updatedAt: string;   // ISO datetime
}

export interface CreateCustomerRequest {
  name: string;
  identification?: string;
  phone?: string;
  email?: string;
  observation?: string;
}

export type UpdateCustomerRequest = Partial<CreateCustomerRequest>;

export interface CustomerResponse { customer: CustomerRow; }
export interface CustomerListResponse { customers: CustomerRow[]; }
export interface DeleteCustomerResponse { id: string; deleted: true; }
```

### 9.6 `dtos/report-type.type.ts`

```ts
export type ReportType = 'minisplit' | 'chiller' | 'uma';
```

### 9.7 `dtos/report-status.type.ts`

```ts
export type ReportStatus =
  | 'created'
  | 'in-progress'
  | 'finished'
  | 'mailed';
```

> Lifecycle: `created` → `in-progress` (auto-bumped on first PATCH or
> picture upload) → `finished` (after signature; locked) → `mailed`
> (auto-bumped after first email send; locked). Editable statuses are
> `created` and `in-progress`.

### 9.8 `dtos/report-data.type.ts`

```ts
export interface MinisplitData {
  is_operating: boolean;
  remote_working: boolean;
  amperage: string;
  filter: boolean;
  inner_voltage: string;
  unusual_noise: boolean;
  observations: string;
}

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

export type ReportData = MinisplitData | ChillerData | UmaData;
```

> Field names stay **snake_case** because the backend stores them that way in
> `report_details.data` JSONB and round-trips them verbatim. Don't convert.

### 9.9 `dtos/report.dto.ts`

```ts
import type { ReportType } from './report-type.type';
import type { ReportStatus } from './report-status.type';
import type { ReportData } from './report-data.type';

export interface ReportRow {
  id: string;                          // format: R-YYYYMMDD-NNNN
  reportType: ReportType;
  workType: string | null;
  dateArrival: string | null;          // ISO datetime
  dateDeparture: string | null;        // ISO datetime
  createdBy: string;                   // user UUID
  assignedTo: string;                  // user UUID
  clientId: string;                    // customer UUID
  signedBy: string | null;
  status: ReportStatus;
  signedAt: string | null;             // ISO datetime
  finishedAt: string | null;           // ISO datetime
  mailedAt: string | null;             // ISO datetime
  createdAt: string;                   // ISO datetime
  updatedAt: string;                   // ISO datetime
}

export interface ReportDetailRow {
  reportId: string;
  data: ReportData;
  pictures: string[];                  // CDN URLs
  signature: string | null;            // CDN URL
  contentFilledAt: string | null;      // ISO datetime
  updatedAt: string;                   // ISO datetime
}

export interface ReportListQuery {
  status?: ReportStatus;
  client_id?: string;
  assigned_to?: string;                // admin-only filter; technicians auto-scoped
  work_type?: string;
  folio?: string;                      // prefix match on report id
  date_from?: string;                  // ISO datetime
  date_to?: string;                    // ISO datetime
}

export interface CreateReportFields {
  report_type: ReportType;
  work_type?: string;
  client_id: string;
  date_arrival?: string;
  date_departure?: string;
  assigned_to?: string;                // admin only
  signed_by?: string;
  data: ReportData;                    // serialized to JSON by the service
  pictures?: File[];
  signature?: File;
  signature_base64?: string;
}

export interface UpdateReportRequest {
  work_type?: string;
  date_arrival?: string;
  date_departure?: string;
  client_id?: string;
  data?: Partial<ReportData>;
}

export interface UpdateAssigneeRequest { assigned_to: string; }

export interface AddSignatureFields {
  signed_by: string;
  signature?: File;
  signature_base64?: string;
}

export interface DeletePicturesRequest { urls: string[]; }

export interface ReportResponse {
  report: ReportRow;
  details: ReportDetailRow;
}

export interface ReportHeaderResponse { report: ReportRow; }
export interface ReportDetailsResponse { details: ReportDetailRow; }
export interface ReportListResponse { reports: ReportRow[]; }
export interface DeleteReportResponse { id: string; deleted: true; }
```

### 9.10 `dtos/report-email.dto.ts`

```ts
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

export interface SendReportEmailRequest {
  to?: string;
  cc?: string[];
  expiresInDays?: number;              // 1..365
  message?: string;                    // <= 2000 chars
}

export interface SendReportEmailResponse {
  emailId: string;
  sentAt: string;
}

export interface ReportEmailListResponse { emails: ReportEmailRow[]; }
export interface RevokeEmailResponse { id: string; revoked: true; }
```

### 9.11 `dtos/upload.dto.ts`

```ts
export interface UploadImageResponse {
  url: string;     // CDN URL
  key: string;     // R2 object key (reports/<ms>-<sanitized-name>)
}
```

### 9.12 `dtos/api-error.type.ts`

```ts
import type { HttpErrorResponse } from '@angular/common/http';
import type { ReportStatus } from './report-status.type';

export interface ApiError {
  error: string;          // machine code, e.g. 'not_found', 'invalid_credentials'
  message?: string;       // human-readable detail (optional)
  status?: ReportStatus;  // present on 'not_editable' / 'already_signed' / 'report_not_ready'
}

export const asApiError = (e: HttpErrorResponse): ApiError =>
  (e.error && typeof e.error === 'object' ? e.error : { error: 'unknown' }) as ApiError;
```

Action handlers typically swallow errors and surface them as toasts:

```ts
catchError((err: HttpErrorResponse) => {
  const e = asApiError(err);
  this.toast.show(e.message ?? e.error, 'error');
  return EMPTY;
});
```

---

## 10. HTTP services

Every service in `/http` uses `inject(RemoteService)` and exposes one method
per backend endpoint. No overloads. No alternative shapes. The method name
mirrors the action; the parameter names mirror the path/body.

**These services are called from `@Action` handlers inside the NgXs states,
not directly from components.** A component imports an action class,
dispatches it, and selects the result. The only exception is the public PDF
download (`ReportsService.downloadByToken`), which has no associated state
slice (the file is consumed once and discarded).

### 10.1 `http/auth.service.ts`

```ts
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { RemoteService } from './remote.service';
import type { LoginRequest, LoginResponse } from '../dtos/auth.dto';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly remote = inject(RemoteService);

  login(body: LoginRequest): Observable<LoginResponse> {
    return this.remote.post<LoginResponse>('/auth/login', body);
  }
}
```

### 10.2 `http/users.service.ts`

```ts
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { RemoteService } from './remote.service';
import type {
  CreateUserRequest, UpdateUserRequest,
  UserResponse, UserListResponse, DeleteUserResponse,
} from '../dtos/user.dto';

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

### 10.3 `http/customers.service.ts`

```ts
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { RemoteService } from './remote.service';
import type {
  CreateCustomerRequest, UpdateCustomerRequest,
  CustomerResponse, CustomerListResponse, DeleteCustomerResponse,
} from '../dtos/customer.dto';

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

### 10.4 `http/reports.service.ts`

The largest service. Some endpoints are multipart, some are JSON. Keep the
form-building logic inside the service so callers (the action handlers) pass
plain objects.

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
} from '../dtos/report.dto';
import type {
  SendReportEmailRequest, SendReportEmailResponse,
  ReportEmailListResponse, RevokeEmailResponse,
} from '../dtos/report-email.dto';

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

  // — Email subresource —

  sendEmail(id: string, body: SendReportEmailRequest): Observable<SendReportEmailResponse> {
    return this.remote.post<SendReportEmailResponse>(`/reports/${id}/email`, body);
  }

  listEmails(id: string): Observable<ReportEmailListResponse> {
    return this.remote.get<ReportEmailListResponse>(`/reports/${id}/emails`);
  }

  revokeEmail(emailId: string): Observable<RevokeEmailResponse> {
    return this.remote.post<RevokeEmailResponse>(`/reports/emails/${emailId}/revoke`, {});
  }

  // — Public PDF download (no auth required, token is in URL) —

  downloadByToken(token: string): Observable<Blob> {
    return this.remote.getBlob(`/reports/download/${token}`);
  }
}
```

### 10.5 `http/upload.service.ts`

```ts
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { RemoteService } from './remote.service';
import type { UploadImageResponse } from '../dtos/upload.dto';

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

> Upload is the one HTTP service with no matching state slice — uploads are
> fire-and-forget from the component's perspective (the resulting URL is
> immediately handed to a report `Create`/`AddPictures` action). If a future
> feature needs an upload history or progress dashboard, add an
> `UploadsState`.

---

## 11. Theme services

`frontend/src/theme/` holds UI services with no network involvement and no
NgXs state — purely ephemeral browser-side concerns. Today that's just
`toast.service.ts`; future additions (modal manager, loading spinner, etc.)
that don't justify a state slice go here too.

### `theme/toast.service.ts`

Moved verbatim from `services/toast.service.ts`. No code change — only the
file location and import paths change. After the move, delete the
now-empty `services/` folder.

> Tempting alternative: model toasts as NgXs state. Skipped for now because
> toasts are fire-and-forget with a 3s lifetime and no other slice needs to
> observe them. Revisit if cross-feature replay/queue logic appears.

---

## 12. Migration: add / update / remove

### 12.1 ADD (new files)

| Path | Purpose |
| --- | --- |
| `frontend/src/http/remote.service.ts` | HttpClient wrapper |
| `frontend/src/http/auth.service.ts` | `/auth/login` |
| `frontend/src/http/users.service.ts` | `/users/*` |
| `frontend/src/http/customers.service.ts` | `/customers/*` |
| `frontend/src/http/reports.service.ts` | `/reports/*` |
| `frontend/src/http/upload.service.ts` | `/upload/image` |
| `frontend/src/app/interceptors/auth.interceptor.ts` | Bearer header + 401 → `Logout` |
| `frontend/src/app/guards/auth-guard.ts` | Functional `authGuard` (replaces `app/auth/auth-guard.ts`) |
| `frontend/src/app/directives/.gitkeep` | Reserve the folder for future custom directives |
| `frontend/src/app/pipes/.gitkeep` | Reserve the folder for future custom pipes |
| `frontend/src/state/auth/auth.state.ts` | AuthState (persisted) |
| `frontend/src/state/auth/auth.actions.ts` | `Login`, `LoadCurrentUser`, `Logout` |
| `frontend/src/state/users/users.state.ts` | UsersState |
| `frontend/src/state/users/users.actions.ts` | `LoadUsers`, `LoadUser`, `CreateUser`, `UpdateUser`, `DeleteUser` |
| `frontend/src/state/customers/customers.state.ts` | CustomersState |
| `frontend/src/state/customers/customers.actions.ts` | `LoadCustomers`, `LoadCustomer`, `SelectCustomer`, `CreateCustomer`, `UpdateCustomer`, `DeleteCustomer` |
| `frontend/src/state/reports/reports.state.ts` | ReportsState (entities + details + query) |
| `frontend/src/state/reports/reports.actions.ts` | `LoadReports`, `LoadReport`, `CreateReport`, `UpdateReport`, `SetAssignee`, `AddSignature`, `AddPictures`, `RemovePictures`, `DeleteReport`, `SendReportEmail`, `LoadReportEmails`, `RevokeReportEmail`, `SetReportsQuery` |
| `frontend/src/dtos/api-error.type.ts` | `ApiError` + `asApiError` helper |
| `frontend/src/dtos/jwt-payload.type.ts` | `JwtPayload` |
| `frontend/src/dtos/auth.dto.ts` | login req/resp |
| `frontend/src/dtos/user.dto.ts` | user DTOs |
| `frontend/src/dtos/user-type.type.ts` | `UserType` |
| `frontend/src/dtos/customer.dto.ts` | customer DTOs |
| `frontend/src/dtos/report.dto.ts` | report DTOs |
| `frontend/src/dtos/report-type.type.ts` | `ReportType` |
| `frontend/src/dtos/report-status.type.ts` | `ReportStatus` |
| `frontend/src/dtos/report-data.type.ts` | minisplit/chiller/uma data |
| `frontend/src/dtos/report-email.dto.ts` | email subresource DTOs |
| `frontend/src/dtos/upload.dto.ts` | upload response |
| `frontend/src/theme/toast.service.ts` | moved from `/services` |

### 12.2 UPDATE (existing files)

| Path | Change |
| --- | --- |
| `frontend/package.json` | Add `@ngxs/store`, `@ngxs/storage-plugin`, `@ngxs/devtools-plugin`, `@ngxs/logger-plugin` |
| `frontend/src/app/app.config.ts` | Replace providers per §7 (adds `provideStore` + plugins; interceptor imported from `./interceptors/auth.interceptor`) |
| `frontend/src/app/app.routes.ts` | Replace `canActivate: [AuthGuard]` (class) with `canActivate: [authGuard]` (function); update import to `./guards/auth-guard` |
| `frontend/src/environments/environment.ts` | Production CF Workers URL |
| `frontend/src/environments/environment.development.ts` | `production: false`, `apiUrl: 'http://127.0.0.1:8787'` |
| `frontend/src/app/pages/login/*` | Dispatch `new Login({ email, password })`; remove direct HttpClient calls and any `localStorage.setItem('token', ...)` |
| `frontend/src/app/pages/register/*` | Dispatch `new CreateUser(payload)`; remove direct HttpClient/fetch |
| `frontend/src/app/pages/customer-add/customer-add.ts` | Dispatch `new CreateCustomer(payload)`; remove inline `JwtPayload`; remove `localStorage` reads (use `select(AuthState.user)`) |
| `frontend/src/app/pages/reports/*` | Dispatch `new SetReportsQuery(filter)` + `new LoadReports()`; select `ReportsState.list` and `.loading` |
| `frontend/src/app/pages/report-add/report-add.ts` | Dispatch `new CreateReport(fields)`; remove inline `JwtPayload`; remove manual `FormData` building |
| `frontend/src/app/pages/report-detail/*` | Dispatch `new LoadReport(id)`, `new UpdateReport(id, payload)`, `new AddSignature(...)`, `new AddPictures(...)`, `new RemovePictures(...)`, `new SendReportEmail(id, ...)`; select `ReportsState.byId(id)` + details slice |
| `frontend/src/app/shared/bottom-nav/*` | Read role/email via `select(AuthState.role)` and `select(AuthState.email)`; logout dispatches `new Logout()` |
| All remaining `frontend/src/app/**` files importing from `../../services/*` | Update imports to `/http/*`, `/theme/*`, or use NgXs dispatches |

### 12.3 REMOVE (deletions)

| Path | Reason |
| --- | --- |
| `frontend/src/app/auth/auth-guard.ts` | Replaced by `frontend/src/app/guards/auth-guard.ts` (functional) |
| `frontend/src/app/auth/` (empty folder) | Delete once `auth-guard.ts` moves out — no other contents |
| `frontend/src/services/customers.ts` | Replaced by `http/customers.service.ts` + `CustomersState` |
| `frontend/src/services/reports.ts` | Replaced by `http/reports.service.ts` + `ReportsState` |
| `frontend/src/services/toast.service.ts` | Moved to `theme/toast.service.ts` |
| `frontend/src/services/` (empty folder) | Delete once contents migrated |
| Inline `JwtPayload` in the old `app/auth/auth-guard.ts` | Replaced by import from `dtos/jwt-payload.type.ts` |
| Inline `JwtPayload` in `app/pages/customer-add/customer-add.ts` | Same |
| Inline `JwtPayload` in `app/pages/report-add/report-add.ts` | Same |
| Inline `Customer` interface in `services/customers.ts` | Replaced by `dtos/customer.dto.ts` (shape changes — adds `createdAt`/`updatedAt`, fields become nullable) |
| All `localStorage.getItem/setItem/removeItem` calls outside the storage plugin | NgXs + `@ngxs/storage-plugin` is the only persistence mechanism |
| `importProvidersFrom(HttpClientModule)` in `app.config.ts` | Deprecated; redundant with `provideHttpClient` |
| `https://manttio.vercel.app/api/` references | Replaced by Cloudflare Workers URL in env files |
| `console.log` debug calls in the old `auth-guard.ts` | Cleanup; no longer needed once flow is verified |

### 12.4 Type / interface / data changes the implementer must notice

- **`Customer.identification | phone | email | observation`** are now
  `string | null` (were `string`). All consumers should narrow before
  rendering.
- **Role storage** changes from the legacy `'true'/'false'` (meaning
  `is_admin`) in `localStorage` to `'admin'/'technician'` inside
  `AuthState.user.role`. Every reader of `localStorage.getItem('role')`
  becomes `store.select(AuthState.role)`. The auth migration PR must do
  this atomically — there is no compatibility shim.
- **`UserRole` → `UserType` (frontend type name only).** The wire field
  stays `role`. Internal references like `role: UserRole` become
  `role: UserType`.
- **Login response** drops the inline `user` object. Login becomes a
  two-step flow inside the `Login` action handler (POST `/auth/login` →
  GET `/users/me`).
- **Report `data` field** is now strongly typed via the discriminated union
  `ReportData`. Components that read `report.details.data.X` get
  IntelliSense but must narrow on `reportType` first when a specific field
  is needed:
  ```ts
  if (report.reportType === 'minisplit') {
    const d = details.data as MinisplitData;
    // d.amperage, d.filter, etc.
  }
  ```

---

## 13. Implementation roadmap (PR sequence)

Each PR is independently shippable and reviewable. Order matters — later PRs
depend on the foundation laid by earlier ones.

| # | Title | Scope |
| --- | --- | --- |
| **1** | **Foundation: DTOs, RemoteService, NgXs setup, Angular folder layout** | Add all `/dtos/*` files. Add `RemoteService`. Install NgXs packages. Add empty `AuthState`/`UsersState`/`CustomersState`/`ReportsState` skeletons (state class + actions, no handlers yet). Create `/app/guards/`, `/app/interceptors/`, `/app/directives/`, `/app/pipes/` folders (with `.gitkeep` for the empty ones). Move `auth.interceptor.ts` into `/app/interceptors/`. Wire `provideStore`, `withNgxsStoragePlugin({ keys: ['auth'] })`, devtools, logger, and `withInterceptors([authInterceptor])` in `app.config.ts`. Update both environment files. No callers migrated yet — existing `services/customers.ts` and `services/reports.ts` keep working. Verify with `pnpm build`. |
| **2** | **Auth migration** | Add `http/auth.service.ts` and `http/users.service.ts`. Fill in `AuthState` action handlers (`Login`, `LoadCurrentUser`, `Logout`). Fill in `UsersState.me` action. Move `app/auth/auth-guard.ts` → `app/guards/auth-guard.ts`, rewrite as functional `authGuard` reading from the store; delete the empty `app/auth/` folder. Update `app.routes.ts` to reference the functional guard. Update login page to dispatch `new Login(...)`. Update register page. Update `bottom-nav` and any other readers to use `select(AuthState.role/email)` — atomic switch from legacy `'true'/'false'` storage to `'admin'/'technician'`. Confirm persistence works via DevTools (Application → localStorage shows `auth` key). |
| **3** | **Users management (admin)** | Fill in remaining `UsersState` handlers (list/get/create/update/delete). Build admin-only users page if scoped, or just expose the actions for future use. |
| **4** | **Customers migration** | Fill in `CustomersState` action handlers using `http/customers.service.ts`. Migrate `customer-add` page and any list views to dispatch + select. Delete `services/customers.ts`. Remove inline `JwtPayload` and `Customer` interface duplicates. |
| **5** | **Reports migration** | Fill in `ReportsState` action handlers using `http/reports.service.ts`. Migrate reports list (filters dispatch `SetReportsQuery` then `LoadReports`), `report-add` (dispatches `CreateReport`), `report-detail` (dispatches `LoadReport`, `UpdateReport`, `AddSignature`, `AddPictures`, `RemovePictures`, `SendReportEmail`). Strong-typed `ReportData` access where needed. Delete `services/reports.ts`. |
| **6** | **Upload + image picker** | Add `http/upload.service.ts`. Wire `image-picker` component to it for standalone uploads (if needed by any flow outside report creation). |
| **7** | **Theme migration + final cleanup** | Move `services/toast.service.ts` → `theme/toast.service.ts`. Update all imports. Delete `services/` folder. Remove dead code (`console.log`s in the old guard, old Vercel URL strings). Verify `grep -r 'manttio.vercel.app' frontend/` and `grep -rn 'localStorage' frontend/src/` return nothing outside the storage plugin's own internals. |

Each PR should: pass `pnpm tsc --noEmit`, pass `pnpm test` (if there are
frontend tests by then), and be exercised by manually clicking through the
affected pages in a browser pointed at a `wrangler dev` backend.

---

## 14. Angular 20 + NgXs coding standards used in this plan

### Angular 20

- **`inject()` over constructor DI.** Services, components, and NgXs state
  classes use `private readonly foo = inject(FooService)` field syntax.
- **Functional interceptors** (`HttpInterceptorFn`) registered via
  `provideHttpClient(withInterceptors([...]))`. No class-based
  `HTTP_INTERCEPTORS` provider. All interceptors live in
  `/src/app/interceptors/`.
- **Functional guards** (`CanActivateFn`, etc.). All guards live in
  `/src/app/guards/`. The current class-based `AuthGuard implements
  CanActivate` is rewritten per §5.5.
- **Angular primitives are folder-grouped under `/app`.** Guards in
  `/app/guards/`, interceptors in `/app/interceptors/`, directives in
  `/app/directives/`, pipes in `/app/pipes/`. When adding a new kind
  (resolvers, error handlers, etc.), follow the same `/app/<kind>s/`
  pattern.
- **No `HttpClientModule` import.** `provideHttpClient` is the only API.
- **`Observable<T>` returns from `/http` services.** Don't `.toPromise()` /
  `firstValueFrom` in services — let the action handler / component choose.

### NgXs

- **`provideStore([...])` + plugin function APIs.** No `NgxsModule.forRoot`.
- **One state class per entity.** Named `<Entity>State`, located in
  `state/<entity>/<entity>.state.ts`.
- **Actions are plain classes** with `static readonly type` and an optional
  constructor for the payload — one action per intent. Group all actions for
  one state in `<entity>.actions.ts`.
- **Selectors are static methods** on the state class with `@Selector()`.
  Components consume them via the functional `select()` helper or the
  `@Select` decorator. Snapshot reads (for interceptors/guards) go through
  `store.selectSnapshot(StateClass.selectorName)`.
- **Components dispatch, never mutate.** Components call
  `store.dispatch(new SomeAction(payload))` and never reach into a service
  directly for entity reads/writes.
- **Action handlers return the Observable** from the HTTP call when state
  must reflect the response — NgXs waits for completion before resolving the
  dispatch.
- **Persistence is opt-in per slice.** Only `auth` is persisted. All other
  states default-initialize empty on bootstrap, which is correct behavior
  (we want fresh entity reads after refresh).

---

## 15. Frequently-asked questions for the implementer

**Q: Why NgXs instead of NgRx / Signals Store / a service with `BehaviorSubject`?**
A: NgXs gives the redux pattern (single store, immutable updates, devtools,
time-travel, persistence plugin) with less boilerplate than NgRx (no
reducer/effect split, action and handler co-located via the `@Action`
decorator). It also pairs cleanly with NgXs's storage plugin which solves
the JWT-survival-across-reload requirement without us writing any
localStorage glue. The decision is recorded; new state-holding code must
default to NgXs (see project memory).

**Q: Why does the login flow now make two requests?**
A: The new backend's `/auth/login` returns only `{ token }`. The cleanest
fix is the canonical pattern: log in, then fetch the user. `/users/me` is
cheap and gives us the full `PublicUser` shape, role included. Both
requests live inside the `Login` action handler, so callers dispatch one
action and the state ends in the right shape.

**Q: Should I keep `jwt-decode` or rely on the backend `/users/me`?**
A: Keep `jwt-decode` only for **expiry checks** in the guard (avoids a
network round-trip on every navigation). Role and identity come from
`/users/me` once at login time and live in `AuthState.user`.

**Q: Where do components go for the "currently logged-in user's email/role"?**
A: `select(AuthState.email)` / `select(AuthState.role)`. Both come from
`AuthState.user` which was set during `Login`.

**Q: What if an action handler needs another state's value?**
A: Inject `Store` and call `selectSnapshot`:
```ts
const userId = this.store.selectSnapshot(AuthState.user)?.id;
```
Don't import another state's action and dispatch it from inside a handler
unless the cascade is intentional.

**Q: Where do I put a new pipe / directive / resolver?**
A: `/src/app/pipes/<name>.pipe.ts`, `/src/app/directives/<name>.directive.ts`,
`/src/app/resolvers/<name>.resolver.ts`. Follow the `/app/<kind>s/` pattern —
one folder per Angular concept, plural.

**Q: What about offline / poor network?**
A: Out of scope. Each action handler returns an `Observable<T>`; the
dispatch resolves with the same observable so the component can subscribe
and show errors via `ToastService`. A shared error-toast `catchError`
helper can be added in PR #7 if patterns emerge.

**Q: Where do I report a DTO mismatch with the backend?**
A: First check the backend test files — they're the source of truth:
- `/backend/test/auth.test.ts`
- `/backend/test/users.test.ts`
- `/backend/test/customers.test.ts`
- `/backend/test/reports.test.ts`
- `/backend/test/upload.test.ts`

If a DTO here drifts from a test there, the test wins — update this plan
and the DTOs.

---

*Last updated: 2026-05-16.*
