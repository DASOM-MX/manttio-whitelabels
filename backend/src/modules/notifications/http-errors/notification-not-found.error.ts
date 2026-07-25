// Thrown when a mark-read targets a row that doesn't exist OR belongs to
// another user — the repository scopes every mutation to the caller
// (`recipient_user_id = auth.userId`), so a foreign id is indistinguishable
// from a missing one by design (plan §2.2). The controller maps it to 404.
export class NotificationNotFoundError extends Error {
  constructor(id: string) {
    super(`notification '${id}' not found`);
    this.name = 'NotificationNotFoundError';
  }
}
