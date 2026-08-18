// SSE stream cadence (12 CP-4) — the per-connection event-poll interval and
// the comment-heartbeat interval. Same posture as the notifications stream
// (its §2.2): the DB row is the truth, each connection polls it — Workers
// isolates share no memory across the fleet. Mirrors the notifications
// numbers today but stays a separate constant so the two streams can be
// tuned independently.
export const VISITS_STREAM_POLL_MS = 2_000;
export const VISITS_STREAM_HEARTBEAT_MS = 15_000;
