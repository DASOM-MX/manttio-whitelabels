/**
 * Thrown when a contact email is not unique on create or update.
 * Maps to 409 Conflict.
 */
export class DuplicateEmailError extends Error {
  constructor() {
    super('El correo de un contacto ya existe en el inquilino');
    this.name = 'DuplicateEmailError';
  }
}
