// Thrown when a publish is requested for a section that has never been saved
// (no draft for `home`, or `clients` before any entry existed and none exist).
// The controller maps it to 409 — the editor's publish bar normally prevents
// this by disabling publish when there are no unpublished changes.
export class NothingToPublishError extends Error {
  constructor(section: string) {
    super(`nothing to publish for section '${section}'`);
    this.name = 'NothingToPublishError';
  }
}
