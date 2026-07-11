// Thrown when disable is requested on an already-disabled template — `disabled`
// is terminal, no transition leaves it. The controller maps it to 409
// template_already_disabled.
export class TemplateAlreadyDisabledError extends Error {
  constructor() {
    super('template is already disabled');
    this.name = 'TemplateAlreadyDisabledError';
  }
}
