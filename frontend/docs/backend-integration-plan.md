# Frontend ↔ Backend Integration Plan

This document is the blueprint for wiring the Angular 20 frontend
(`/frontend`) to the new Cloudflare Workers + Neon backend (`/backend`). It is
written for the developer who will execute the migration: every section is
meant to be actionable, and every file referenced is either created, updated,
or deleted by a specific PR in the roadmap below.

The plan introduces:
- a single HTTP entry-point (`RemoteService`) wrapping `HttpClient`,
- a functional `authInterceptor` that pins the JWT to outgoing requests,
- a `/http` folder containing one service file per backend entity,
- a `/theme` folder for UI-only services (toasts, future modals, etc.),
- a `/dtos` folder for typed request/response shapes mirroring the backend.

It does **not** introduce a state-management library (NgRx, Signals store,
etc.). Services return typed `Observable<T>` and components subscribe — same
as today, just cleaner.

---

## 1. Goals

1. **One source of truth per backend entity.** Every endpoint is reached
   through exactly one method in exactly one service. No HTTP calls live in
   components.
2. **JWT injection happens once.** Components and entity services never read
   `localStorage.getItem('token')` or build an `Authorization` header. A
   functional HTTP interceptor handles it.
3. **Typed end-to-end.** Every request and response has a named DTO matching
   the backend. No `any` in HTTP signatures.
4. **Angular 20 idiomatic.** `inject()` over constructor DI, functional
   guards/interceptors over class-based equivalents, no deprecated
   `HttpClientModule` import.
5. **Friendly for the next developer.** Folder layout is self-explaining,
   files are predictable, naming is consistent.

## 2. Non-goals

- No state library (NgRx / Signals store / Akita). Component-local state
  stays component-local. Cross-component state stays in `BehaviorSubject`s
  inside services where it lives today.
- No refresh-token flow. Backend issues a single short-lived JWT; on 401 the
  user is bounced to `/login`. (Add later if the backend grows refresh
  endpoints.)
- No SSR / Universal. Pure SPA.
- No request caching layer. Each call hits the network.

---

## 3. Target folder structure

```
frontend/src/
├── http/
│   ├── remote.service.ts             # the wrapper around HttpClient
│   ├── token-storage.service.ts      # localStorage facade (token/role/email)
│   ├── interceptors/
│   │   └── auth.interceptor.ts       # functional HttpInterceptorFn
│   ├── auth.service.ts               # POST /auth/login
│   ├── users.service.ts              # /users/*
│   ├── customers.service.ts          # /customers/*
│   ├── reports.service.ts            # /reports/* (incl. signature, pictures, email, download)
│   └── upload.service.ts             # POST /upload/image
│
├── theme/
│   └── toast.service.ts              # moved from /services/toast.service.ts
│
├── dtos/
│   ├── api-error.type.ts             # canonical { error, message?, status? }
│   ├── jwt.type.ts                   # JwtPayload (sub, role, exp, iat)
│   ├── auth.dto.ts                   # LoginRequest, LoginResponse
│   ├── user.dto.ts                   # PublicUser, CreateUser*, UpdateUser*, List* responses
│   ├── user.type.ts                  # UserRole = 'admin' | 'technician'
│   ├── customer.dto.ts               # CustomerRow, Create/UpdateCustomerRequest, list/single responses
│   ├── report.dto.ts                 # ReportRow, ReportDetailRow, CreateReportRequest, UpdateReportRequest, ListReportsQuery
│   ├── report.type.ts                # ReportType, ReportStatus
│   ├── report-data.type.ts           # MinisplitData, ChillerData, UmaData, ReportData (union)
│   ├── report-email.dto.ts           # ReportEmailRow, SendReportEmailRequest, SendReportEmailResponse
│   └── upload.dto.ts                 # UploadImageResponse
│
├── app/
│   ├── auth/
│   │   └── auth-guard.ts             # rewritten as functional CanActivateFn
│   ├── components/ ...
│   ├── layouts/ ...
│   ├── pages/ ...
│   └── shared/ ...
│
├── environments/
│   ├── environment.ts                # production CF Workers URL
│   └── environment.development.ts    # local `wrangler dev` URL, production: false
│
└── services/                         # DELETED after migration (see §10)
```

### Naming conventions

| Pattern | Use for | Example |
| --- | --- | --- |
| `<entity>.service.ts` | HTTP entity services (in `/http`) and UI services (in `/theme`) | `customers.service.ts`, `toast.service.ts` |
| `<entity>.dto.ts` | Request and response payload interfaces | `customer.dto.ts` |
| `<entity>.type.ts` | Supporting types: enums, unions, primitives | `report.type.ts` |
| `<name>.interceptor.ts` | Functional `HttpInterceptorFn` | `auth.interceptor.ts` |

A DTO file may contain multiple related interfaces. A type file may contain
multiple related unions/enums. Don't fragment — one file per entity is fine.

### Entity naming note

The backend exposes `/customers` and the existing service is
`services/customers.ts`. The plan keeps **`customers`** as the canonical
entity name on the frontend too (not `clients`), so route, DTO, and service
names line up 1:1. UI copy can still say "Cliente" — that's a translation
concern, not a code-identifier concern.

---

## 4. `RemoteService` — the HTTP wrapper

**Path:** `frontend/src/http/remote.service.ts`

### Responsibilities

- Prepend `environment.apiUrl` to every relative path.
- Expose typed verbs (`get`, `post`, `patch`, `put`, `delete`) returning
  `Observable<T>`.
- Provide a `postForm<T>(path, form: FormData)` for multipart uploads.
- Provide a `getBlob(path)` for binary downloads (PDF).
- **Not** read or write the JWT — that's the interceptor's job. RemoteService
  is auth-agnostic.

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

**Why no `Authorization` header here?** The interceptor (§5) adds it to every
outgoing request that has a JWT in storage. Routes that don't need a JWT
(public download, login) still pass through cleanly: the interceptor skips
when there's no token.

---

## 5. `authInterceptor` and `TokenStorageService`

### `TokenStorageService`

**Path:** `frontend/src/http/token-storage.service.ts`

Centralizes all `localStorage` reads/writes for auth data. Today these are
scattered: `auth-guard.ts` reads `token`, login writes `token`/`role`/`email`,
bottom-nav reads them. After the migration, only this service touches
`localStorage` for auth.

```ts
import { Injectable } from '@angular/core';
import type { UserRole } from '../dtos/user.type';

const KEY_TOKEN = 'token';
const KEY_ROLE = 'role';
const KEY_EMAIL = 'email';

@Injectable({ providedIn: 'root' })
export class TokenStorageService {
  getToken(): string | null { return localStorage.getItem(KEY_TOKEN); }
  setToken(t: string): void { localStorage.setItem(KEY_TOKEN, t); }
  clearToken(): void { localStorage.removeItem(KEY_TOKEN); }

  getRole(): UserRole | null { return localStorage.getItem(KEY_ROLE) as UserRole | null; }
  setRole(r: UserRole): void { localStorage.setItem(KEY_ROLE, r); }

  getEmail(): string | null { return localStorage.getItem(KEY_EMAIL); }
  setEmail(e: string): void { localStorage.setItem(KEY_EMAIL, e); }

  clearAll(): void {
    localStorage.removeItem(KEY_TOKEN);
    localStorage.removeItem(KEY_ROLE);
    localStorage.removeItem(KEY_EMAIL);
  }
}
```

> **Note on role storage.** Today the code stores `role` as the string
> `'true'`/`'false'` (meaning `is_admin`). This plan changes it to the actual
> role string (`'admin'` | `'technician'`) matching the JWT and backend. The
> migration PR for auth (§11, PR #2) must update every reader (e.g.
> `bottom-nav`, route guards) at the same time.

### `authInterceptor`

**Path:** `frontend/src/http/interceptors/auth.interceptor.ts`

```ts
import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { TokenStorageService } from '../token-storage.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const storage = inject(TokenStorageService);
  const router = inject(Router);
  const token = storage.getToken();

  const authedReq = token
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;

  return next(authedReq).pipe(
    catchError((err) => {
      if (err?.status === 401) {
        storage.clearAll();
        router.navigate(['/login']);
      }
      return throwError(() => err);
    }),
  );
};
```

Two behaviors live here on purpose:
- **Token attach:** every outgoing request gets the header if a token exists.
- **401 redirect:** any 401 from the backend clears storage and bounces to
  `/login`. Components don't need to handle expired-token cases manually.

> The public `GET /reports/download/:token` endpoint accepts the URL even if a
> stale `Authorization` header is sent (backend ignores it on that route), so
> there's no opt-out logic needed.

---

## 6. `app.config.ts` — wiring

**Update:** `frontend/src/app/app.config.ts`

Replace the current providers with:

```ts
import { ApplicationConfig, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { routes } from './app.routes';
import { authInterceptor } from '../http/interceptors/auth.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideHttpClient(withInterceptors([authInterceptor])),
    provideRouter(routes),
  ],
};
```

Changes from current:
- Adds `withInterceptors([authInterceptor])`.
- Removes `importProvidersFrom(HttpClientModule)` — deprecated and redundant
  with `provideHttpClient`.

---

## 7. Environment configuration

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
> backend worker. The implementing PR (§11, PR #1) should also document the
> dev workflow in the frontend README: "run `pnpm wrangler dev` in
> `/backend`, then `pnpm start` in `/frontend`."

---

## 8. DTOs and types

This section is the contract. Each interface mirrors a backend response or
request body verbatim. The full backend API catalog is in
[`/backend/test/`](../../backend/test/) — these DTOs are derived directly
from the zod schemas and route handlers there.

### 8.1 `dtos/jwt.type.ts`

```ts
import type { UserRole } from './user.type';

export interface JwtPayload {
  sub: string;     // user UUID
  role: UserRole;
  iat: number;     // epoch seconds
  exp: number;     // epoch seconds
}
```

Replaces three inline duplicate definitions in:
- `app/auth/auth-guard.ts`
- `app/pages/customer-add/customer-add.ts`
- `app/pages/report-add/report-add.ts`

### 8.2 `dtos/user.type.ts`

```ts
export type UserRole = 'admin' | 'technician';
```

### 8.3 `dtos/user.dto.ts`

```ts
import type { UserRole } from './user.type';

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt: string;   // ISO datetime
  updatedAt: string;   // ISO datetime
}

export interface CreateUserRequest {
  name: string;
  email: string;
  password: string;    // min 8 chars
  role: UserRole;
}

export interface UpdateUserRequest {
  name?: string;
  email?: string;
  password?: string;
  role?: UserRole;
}

export interface UserResponse { user: PublicUser; }
export interface UserListResponse { users: PublicUser[]; }
export interface DeleteUserResponse { id: string; deleted: true; }
```

### 8.4 `dtos/auth.dto.ts`

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
> from the old Vercel backend and must be removed. The new flow is:
>
> 1. POST `/auth/login` → receive token.
> 2. `TokenStorageService.setToken(token)`.
> 3. Call GET `/users/me` to get `PublicUser`.
> 4. `TokenStorageService.setRole(user.role)` and `.setEmail(user.email)`.

### 8.5 `dtos/customer.dto.ts`

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

### 8.6 `dtos/report.type.ts`

```ts
export type ReportType = 'minisplit' | 'chiller' | 'uma';

export type ReportStatus =
  | 'created'
  | 'in-progress'
  | 'finished'
  | 'mailed';
```

### 8.7 `dtos/report-data.type.ts`

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

### 8.8 `dtos/report.dto.ts`

```ts
import type { ReportType, ReportStatus } from './report.type';
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

### 8.9 `dtos/report-email.dto.ts`

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

### 8.10 `dtos/upload.dto.ts`

```ts
export interface UploadImageResponse {
  url: string;     // CDN URL
  key: string;     // R2 object key (reports/<ms>-<sanitized-name>)
}
```

### 8.11 `dtos/api-error.type.ts`

```ts
import type { ReportStatus } from './report.type';

export interface ApiError {
  error: string;          // machine code, e.g. 'not_found', 'invalid_credentials'
  message?: string;       // human-readable detail (optional)
  status?: ReportStatus;  // present on 'not_editable' / 'already_signed' / 'report_not_ready'
}
```

Used as the type for HttpErrorResponse bodies. Helper to extract:

```ts
import type { HttpErrorResponse } from '@angular/common/http';
import type { ApiError } from './api-error.type';

export const asApiError = (e: HttpErrorResponse): ApiError =>
  (e.error && typeof e.error === 'object' ? e.error : { error: 'unknown' }) as ApiError;
```

Place that helper near the type (same file) so any component can do:

```ts
catchError((err: HttpErrorResponse) => {
  const e = asApiError(err);
  this.toast.show(e.message ?? e.error, 'error');
  return EMPTY;
});
```

---

## 9. HTTP services

Every service in `/http` uses `inject(RemoteService)` and exposes one method
per backend endpoint. No overloads. No alternative shapes. The method name
mirrors the action; the parameter names mirror the path/body.

### 9.1 `http/auth.service.ts`

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

### 9.2 `http/users.service.ts`

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

  me(): Observable<UserResponse> {
    return this.remote.get<UserResponse>('/users/me');
  }

  list(): Observable<UserListResponse> {
    return this.remote.get<UserListResponse>('/users/list');
  }

  get(id: string): Observable<UserResponse> {
    return this.remote.get<UserResponse>(`/users/${id}`);
  }

  create(body: CreateUserRequest): Observable<UserResponse> {
    return this.remote.post<UserResponse>('/users', body);
  }

  update(id: string, body: UpdateUserRequest): Observable<UserResponse> {
    return this.remote.patch<UserResponse>(`/users/${id}`, body);
  }

  remove(id: string): Observable<DeleteUserResponse> {
    return this.remote.delete<DeleteUserResponse>(`/users/${id}`);
  }
}
```

### 9.3 `http/customers.service.ts`

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

  list(): Observable<CustomerListResponse> {
    return this.remote.get<CustomerListResponse>('/customers');
  }

  get(id: string): Observable<CustomerResponse> {
    return this.remote.get<CustomerResponse>(`/customers/${id}`);
  }

  create(body: CreateCustomerRequest): Observable<CustomerResponse> {
    return this.remote.post<CustomerResponse>('/customers', body);
  }

  update(id: string, body: UpdateCustomerRequest): Observable<CustomerResponse> {
    return this.remote.patch<CustomerResponse>(`/customers/${id}`, body);
  }

  remove(id: string): Observable<DeleteCustomerResponse> {
    return this.remote.delete<DeleteCustomerResponse>(`/customers/${id}`);
  }
}
```

### 9.4 `http/reports.service.ts`

The largest service. Some endpoints are multipart, some are JSON. Keep the
form-building logic inside the service so callers pass plain objects.

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

### 9.5 `http/upload.service.ts`

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

> The reports module already accepts files inline on `POST /reports` and
> `PUT /reports/:id/pictures`. `UploadService` exists for components that
> need a standalone image upload (e.g. previewing an image before the report
> is created, profile pictures in a future user-management screen).

---

## 10. Theme services

`frontend/src/theme/` holds UI services with no network involvement. Today
that's just `toast.service.ts`; future additions go here too (modals,
loading-spinner state, theme/dark-mode toggle, etc.).

### `theme/toast.service.ts`

Moved verbatim from `services/toast.service.ts`. No code change — only the
file location and import paths change. After the move, delete the now-empty
`services/` folder.

---

## 11. Migration: add / update / remove

### 11.1 ADD (new files)

| Path | Purpose |
| --- | --- |
| `frontend/src/http/remote.service.ts` | HttpClient wrapper |
| `frontend/src/http/token-storage.service.ts` | localStorage facade |
| `frontend/src/http/interceptors/auth.interceptor.ts` | Bearer + 401 handling |
| `frontend/src/http/auth.service.ts` | `/auth/login` |
| `frontend/src/http/users.service.ts` | `/users/*` |
| `frontend/src/http/customers.service.ts` | `/customers/*` |
| `frontend/src/http/reports.service.ts` | `/reports/*` |
| `frontend/src/http/upload.service.ts` | `/upload/image` |
| `frontend/src/dtos/api-error.type.ts` | `ApiError` + helper |
| `frontend/src/dtos/jwt.type.ts` | `JwtPayload` |
| `frontend/src/dtos/auth.dto.ts` | login req/resp |
| `frontend/src/dtos/user.dto.ts` | user DTOs |
| `frontend/src/dtos/user.type.ts` | `UserRole` |
| `frontend/src/dtos/customer.dto.ts` | customer DTOs |
| `frontend/src/dtos/report.dto.ts` | report DTOs |
| `frontend/src/dtos/report.type.ts` | `ReportType`, `ReportStatus` |
| `frontend/src/dtos/report-data.type.ts` | minisplit/chiller/uma data |
| `frontend/src/dtos/report-email.dto.ts` | email subresource DTOs |
| `frontend/src/dtos/upload.dto.ts` | upload response |
| `frontend/src/theme/toast.service.ts` | moved from `/services` |

### 11.2 UPDATE (existing files)

| Path | Change |
| --- | --- |
| `frontend/src/app/app.config.ts` | Replace providers per §6 |
| `frontend/src/environments/environment.ts` | Production CF Workers URL |
| `frontend/src/environments/environment.development.ts` | `production: false`, `apiUrl: 'http://127.0.0.1:8787'` |
| `frontend/src/app/auth/auth-guard.ts` | Convert to functional `CanActivateFn`; import `JwtPayload` from `dtos/jwt.type.ts`; use `TokenStorageService` instead of direct `localStorage` |
| `frontend/src/app/pages/login/*` | Use `AuthService.login()` → `UsersService.me()`; store via `TokenStorageService` |
| `frontend/src/app/pages/register/*` | Use `UsersService.create()`; remove direct `HttpClient`/`fetch` calls |
| `frontend/src/app/pages/customer-add/customer-add.ts` | Use `CustomersService.create()`; remove inline `JwtPayload` (import instead); remove `localStorage` reads |
| `frontend/src/app/pages/reports/*` | Use `ReportsService.list()` with `ReportListQuery` instead of building URLs |
| `frontend/src/app/pages/report-add/report-add.ts` | Use `ReportsService.create()` with `CreateReportFields`; remove inline `JwtPayload`; remove manual `FormData` building |
| `frontend/src/app/pages/report-detail/*` | Use `ReportsService.get()`, `.update()`, `.addSignature()`, `.addPictures()`, `.removePictures()`; replace direct `HttpClient` + manual auth-header code |
| `frontend/src/app/shared/bottom-nav/*` | Read role/email via `TokenStorageService` instead of `localStorage` directly; logout calls `TokenStorageService.clearAll()` |
| All remaining `frontend/src/app/**` files that still import from `../../services/*` | Update imports to `/http/*` or `/theme/*` |

### 11.3 REMOVE (deletions)

| Path | Reason |
| --- | --- |
| `frontend/src/services/customers.ts` | Replaced by `http/customers.service.ts` |
| `frontend/src/services/reports.ts` | Replaced by `http/reports.service.ts` |
| `frontend/src/services/toast.service.ts` | Moved to `theme/toast.service.ts` |
| `frontend/src/services/` (empty folder) | Delete once contents migrated |
| Inline `JwtPayload` in `app/auth/auth-guard.ts` | Replaced by import from `dtos/jwt.type.ts` |
| Inline `JwtPayload` in `app/pages/customer-add/customer-add.ts` | Same |
| Inline `JwtPayload` in `app/pages/report-add/report-add.ts` | Same |
| Inline `Customer` interface in `services/customers.ts` | Replaced by `dtos/customer.dto.ts` (note: shape changes — adds `createdAt`/`updatedAt`, fields become nullable) |
| `importProvidersFrom(HttpClientModule)` in `app.config.ts` | Deprecated; redundant with `provideHttpClient` |
| `https://manttio.vercel.app/api/` references | Replaced by Cloudflare Workers URL in env files |
| `console.log` debug calls in `auth-guard.ts` | Cleanup; no longer needed once flow is verified |

### 11.4 Type/interface changes the implementer must notice

- **`Customer.identification | phone | email | observation`** are now
  `string | null` (were `string`). All consumers should narrow before
  rendering.
- **`role` storage** changes from `'true'`/`'false'` to `'admin'`/`'technician'`.
  Every reader of `localStorage.getItem('role')` must update (bottom-nav,
  page guards). The migration PR for auth must do this atomically.
- **Login response** drops the `user` object. Login becomes a two-step flow
  (login then `/users/me`). See §8.4.
- **Report `data` field** is now strongly typed via the discriminated union
  `ReportData`. Components that read `report.details.data.X` get IntelliSense
  but must narrow on `reportType` first when a specific field is needed:
  ```ts
  if (report.reportType === 'minisplit') {
    const d = details.data as MinisplitData;
    // d.amperage, d.filter, etc.
  }
  ```

---

## 12. Implementation roadmap (PR sequence)

Each PR is independently shippable and reviewable. Order matters — later PRs
depend on the foundation laid by earlier ones.

| # | Title | Scope |
| --- | --- | --- |
| **1** | **Foundation: RemoteService + DTOs + interceptor** | Add all `/dtos/*` files. Add `RemoteService`, `TokenStorageService`, `authInterceptor`. Update `app.config.ts`. Update both environment files. No callers migrated yet — existing `services/customers.ts` and `services/reports.ts` keep working. Verify with `pnpm build`. |
| **2** | **Auth migration** | Add `http/auth.service.ts` and `http/users.service.ts`. Rewrite `app/auth/auth-guard.ts` as functional `CanActivateFn` using `TokenStorageService` and `JwtPayload` from DTOs. Update login page to two-step flow (login → `/users/me`). Update register page. Update `bottom-nav` and any other readers to use `TokenStorageService` (handles the `'true'/'false'` → `'admin'/'technician'` switch atomically). |
| **3** | **Customers migration** | Add `http/customers.service.ts`. Migrate `customer-add` page and any list views. Delete `services/customers.ts`. Remove inline `JwtPayload` and `Customer` interface duplicates. |
| **4** | **Reports migration** | Add `http/reports.service.ts`. Migrate `reports` list, `report-add`, `report-detail` pages. Delete `services/reports.ts`. Strong-typed `ReportData` access where needed. |
| **5** | **Upload + image picker** | Add `http/upload.service.ts`. Wire `image-picker` component to it for standalone uploads (if needed by any flow outside report creation). |
| **6** | **Theme migration + final cleanup** | Move `services/toast.service.ts` → `theme/toast.service.ts`. Update all imports. Delete `services/` folder. Remove dead code (`console.log`s in guard, old Vercel URL strings). Verify `grep -r 'manttio.vercel.app' frontend/` returns nothing. |

Each PR should: pass `pnpm tsc --noEmit`, pass `pnpm test` (if there are
frontend tests by then), and be exercised by manually clicking through the
affected pages in a browser pointed at a `wrangler dev` backend.

---

## 13. Angular 20 coding standards used in this plan

- **`inject()` over constructor DI.** Services and components use
  `private readonly foo = inject(FooService)` field syntax.
- **Functional interceptors** (`HttpInterceptorFn`) registered via
  `provideHttpClient(withInterceptors([...]))`. No class-based
  `HTTP_INTERCEPTORS` provider.
- **Functional guards** (`CanActivateFn`). The current class-based
  `AuthGuard implements CanActivate` is rewritten:
  ```ts
  export const authGuard: CanActivateFn = () => {
    const storage = inject(TokenStorageService);
    const router = inject(Router);
    const token = storage.getToken();
    if (!token) return router.parseUrl('/login');
    try {
      const { exp } = jwtDecode<JwtPayload>(token);
      if (exp < Math.floor(Date.now() / 1000)) {
        storage.clearAll();
        return router.parseUrl('/login');
      }
      return true;
    } catch {
      storage.clearAll();
      return router.parseUrl('/login');
    }
  };
  ```
  Wire it in `app.routes.ts` via `canActivate: [authGuard]` (the function
  itself, not a class).
- **No `HttpClientModule` import.** `provideHttpClient` is the only API used.
- **`Observable<T>` returns, not `Promise<T>`.** Components subscribe (or use
  the `async` pipe). Don't `.toPromise()` / `firstValueFrom` in services —
  let the consumer choose.
- **No `any` in HTTP service signatures.** If a return type is genuinely
  variable, use a union or `unknown` and narrow at the call site.

---

## 14. Frequently-asked questions for the implementer

**Q: Why not put DTOs inside `/http/dtos/`?**
A: The user spec is explicit — `/http` holds one file per entity service,
nothing else. Co-locating DTOs there would dilute that rule. `/dtos` as a
sibling keeps `/http` lean.

**Q: Why does the login flow now make two requests?**
A: The new backend's `/auth/login` returns only `{ token }`. The old Vercel
backend returned user data in the same payload. The cleanest fix is the
canonical pattern: log in, then fetch the user. `/users/me` is cheap and
gives us the full `PublicUser` shape, role included.

**Q: Should I keep `jwt-decode` or rely on the backend `/users/me`?**
A: Keep `jwt-decode` only for **expiry checks** in the guard (avoids a
network round-trip on every navigation). Role and identity come from
`/users/me` once at login time and live in `TokenStorageService`.

**Q: What about offline / poor network?**
A: Out of scope. Each method returns `Observable<T>`; consumers can subscribe
with their own retry / error UI via `catchError` + `ToastService`. A shared
error toast helper can be added in PR #6 if patterns emerge.

**Q: Where do I report a DTO mismatch with the backend?**
A: First check the backend test files — they're the source of truth:
- `/backend/test/auth.test.ts`
- `/backend/test/users.test.ts`
- `/backend/test/customers.test.ts`
- `/backend/test/reports.test.ts`
- `/backend/test/upload.test.ts`

If a DTO here drifts from a test there, the test wins — update this plan and
the DTOs.

---

*Last updated: 2026-05-16.*
