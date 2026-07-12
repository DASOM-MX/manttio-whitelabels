// Thrown when an edit/activate is requested on a non-draft template (06 §5.2:
// only drafts are editable, and only drafts activate). The controller maps it
// to 409 template_not_draft.
export class TemplateNotDraftError extends Error {
  constructor() {
    super('template is not in draft status');
    this.name = 'TemplateNotDraftError';
  }
}
