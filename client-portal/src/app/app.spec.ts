import { ApplicationInitStatus } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { App } from './app';
import { appConfig } from './app.config';

/** Boot test, not a component test. It stands the app up on the **real**
 *  `appConfig` provider set — only the HTTP backend is swapped — because the
 *  defects that actually stop this app booting live in the provider graph, not
 *  in `App` itself. The scaffold test this replaced built `TestBed` from
 *  `imports: [App]` with no providers, so it passed green while an `inject()`
 *  after an `await` in the app initializer (NG0203) made the app impossible to
 *  boot at all.
 *
 *  `TestBed.finalize()` calls `ApplicationInitStatus.runInitializers()`, so
 *  the first `TestBed.inject(...)` starts the initializer and `donePromise`
 *  carries whatever it throws. */
describe('App boot', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [App],
      providers: [...appConfig.providers, provideHttpClientTesting()],
    });
  });

  afterEach(() => {
    const http = TestBed.inject(HttpTestingController);
    // The boot-time brand fetch is fire-and-forget; a test that does not assert
    // on it still has to drain it before `verify()`.
    http.match('/brand').forEach((req) => req.flush(null));
    http.verify();
  });

  it('runs the app initializer to completion', async () => {
    const initStatus = TestBed.inject(ApplicationInitStatus);
    await initStatus.donePromise;
    expect(initStatus.done).toBe(true);
  });

  it('dispatches the pre-auth brand fetch on boot', async () => {
    await TestBed.inject(ApplicationInitStatus).donePromise;
    // `apiUrl` stays empty here — no Worker serves `/__config` in a test — so
    // `RemoteService` builds a host-relative URL. Asserting the request at all
    // is the point: it proves the initializer reached `LoadBrand` (03 §4).
    const req = TestBed.inject(HttpTestingController).expectOne('/brand');
    expect(req.request.method).toBe('GET');
    req.flush(null);
  });

  it('creates the root component once booted', async () => {
    await TestBed.inject(ApplicationInitStatus).donePromise;
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    expect(fixture.componentInstance).toBeTruthy();
  });
});
