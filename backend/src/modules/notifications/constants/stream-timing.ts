// SSE stream cadence (plan §2.2): the per-connection DB re-read interval and
// the comment-heartbeat interval. v1 polls the DB (~2 s) per connected user —
// the row is the truth, no in-process pub/sub (Workers isolates don't share
// memory across the fleet); revisit LISTEN/NOTIFY only if watcher load ever
// matters (plan "open decisions").
export const NOTIFICATIONS_STREAM_POLL_MS = 2_000;
export const NOTIFICATIONS_STREAM_HEARTBEAT_MS = 15_000;
