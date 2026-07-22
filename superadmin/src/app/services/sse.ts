import { Observable } from 'rxjs';

/** One parsed SSE frame: the event name (`message` when the frame carries
 *  none) and its JSON-parsed `data:` payload. */
export type SseEvent<T> = { event: string; data: T };

/**
 * Shared fetch-based SSE reader (notifications plan §3.1 — extracted here for
 * the second consumer; WMS repoints to it on its own branch). `EventSource`
 * can't set the `Authorization` header, so this reads the response body
 * manually: Bearer header, line parser over the ReadableStream, one emission
 * per `data:`-carrying frame. Comment/heartbeat lines (`: …`) are ignored.
 *
 * Session-length by design: the observable completes only if the SERVER ends
 * the stream and errors on network/HTTP failure — reconnect/backoff policy
 * belongs to the subscriber (NotificationsState re-syncs from the one-shot
 * GET on every retry). Unsubscribing aborts the underlying fetch.
 */
export const sseStream = <T>(url: string, token: string): Observable<SseEvent<T>> =>
  new Observable<SseEvent<T>>((subscriber) => {
    const controller = new AbortController();

    const emitFrame = (frame: string): void => {
      let event = 'message';
      const dataLines: string[] = [];
      for (const line of frame.split('\n')) {
        if (line.startsWith(':')) continue;
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
      }
      if (dataLines.length === 0) return;
      try {
        subscriber.next({ event, data: JSON.parse(dataLines.join('\n')) as T });
      } catch {
        // Both our streams carry JSON payloads; a torn frame is dropped, and
        // the periodic re-read makes the next poll deliver the row anyway.
      }
    };

    (async () => {
      const res = await fetch(url, {
        headers: {
          authorization: `Bearer ${token}`,
          accept: 'text/event-stream',
        },
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        throw new Error(`sse connect failed: ${res.status}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        buffer = buffer.replace(/\r\n/g, '\n');
        let boundary = buffer.indexOf('\n\n');
        while (boundary !== -1) {
          emitFrame(buffer.slice(0, boundary));
          buffer = buffer.slice(boundary + 2);
          boundary = buffer.indexOf('\n\n');
        }
      }
      subscriber.complete();
    })().catch((err: unknown) => {
      if (controller.signal.aborted) return;
      subscriber.error(err);
    });

    return () => controller.abort();
  });
