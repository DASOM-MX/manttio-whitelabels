// Thrown when deactivate (the active → draft edit path) is requested on a
// template that isn't active. The controller maps it to 409 template_not_active.
export class TemplateNotActiveError extends Error {
  constructor() {
    super('template is not in active status');
    this.name = 'TemplateNotActiveError';
  }
}
