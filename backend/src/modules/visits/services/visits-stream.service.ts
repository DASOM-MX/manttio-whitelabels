import type { SSEStreamingApi } from 'hono/streaming';
import type { Db } from '../../database/client';
import {
  listVisitEventsSince,
  visitStreamCursorStart,
} from '../repository/visits.repository';
import { getVisitById } from './visits.service';
import { VISITS_STREAM_HEARTBEAT_MS, VISITS_STREAM_POLL_MS } from '../constants/stream-timing';

/** Live visit delivery (12 CP-4) — session-length SSE, the notifications
 *  stream pattern: per-connection DB poll over an append-only log, comment
 *  heartbeat, no terminal event. The cursor starts at connect time — there is
 *  deliberately NO replay, the subscriber refetches its window on every
 *  (re)connect and the stream only keeps it warm.
 *
 *  Each forwarded timeline event becomes one `visit` frame carrying
 *  `{ kind, visit }`, where `visit` is the same flattened DTO the single-visit
 *  GET returns — the client upserts by id without a second read. A visit the
 *  detail read no longer resolves (soft-deleted between event and poll) emits
 *  nothing: the window refetch owns disappearances. */
export const streamVisitEvents = async (db: Db, stream: SSEStreamingApi): Promise<void> => {
  // The cursor is the DB's own `::text` timestamp (microsecond precision — a
  // JS Date would truncate to ms and re-deliver the newest row every poll).
  // The poll is `>=`-inclusive, so ids already forwarded at the cursor's exact
  // timestamp are tracked and dropped: same-transaction events share `now()`,
  // and an exclusive read could skip one that surfaced a poll later.
  let cursor = await visitStreamCursorStart(db);
  let forwardedAtCursor = new Set<string>();
  // First write opens the stream client-side before the first poll lands.
  await stream.write(': connected\n\n');

  let lastHeartbeat = Date.now();
  while (!stream.aborted) {
    await stream.sleep(VISITS_STREAM_POLL_MS);
    if (stream.aborted) break;

    const events = (await listVisitEventsSince(db, cursor)).filter(
      (event) => !forwardedAtCursor.has(event.id),
    );
    if (events.length) {
      const newest = events[events.length - 1]!;
      if (newest.createdAt !== cursor) {
        cursor = newest.createdAt;
        forwardedAtCursor = new Set();
      }
      for (const event of events) {
        if (event.createdAt === cursor) forwardedAtCursor.add(event.id);
      }

      // One read per touched visit, not per event — a close+reschedule tick
      // touches two visits across three events.
      const ids = [...new Set(events.map((e) => e.visitId))];
      const visits = new Map(
        (await Promise.all(ids.map(async (id) => [id, await getVisitById(db, id)] as const))).filter(
          ([, visit]) => visit !== null,
        ),
      );
      for (const event of events) {
        const visit = visits.get(event.visitId);
        if (!visit) continue;
        await stream.writeSSE({
          event: 'visit',
          data: JSON.stringify({ kind: event.type, visit }),
        });
      }
    }

    if (Date.now() - lastHeartbeat >= VISITS_STREAM_HEARTBEAT_MS) {
      lastHeartbeat = Date.now();
      // SSE comment line — keeps proxies from idling the connection out.
      await stream.write(': heartbeat\n\n');
    }
  }
};
