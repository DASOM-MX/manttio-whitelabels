// Who is in charge of a location (10-wms/01 §1, user 2026-08-21). The column
// pairs with `assigned_user_id` — set together or not at all (DB check on both
// `warehouses` and `storage_nodes`) — and records the KIND of responsibility,
// which the user's own role can't express: an admin may supervise one warehouse
// while leading the crew in another.
export enum AssignmentRole {
  // Accountable for the location without working it day to day.
  Supervisor = 'supervisor',
  // Runs the crew that works it.
  Leader = 'leader',
  // Works it hands-on. On a warehouse, a technician assignee still means
  // "this is their van" (03 §2).
  Technician = 'technician',
}
