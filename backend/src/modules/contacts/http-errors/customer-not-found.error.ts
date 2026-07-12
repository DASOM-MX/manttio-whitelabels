// Thrown when a contact write targets a customer id that doesn't exist. The
// controller maps it to 404 customer_not_found.
export class CustomerNotFoundError extends Error {
  constructor() {
    super('customer does not exist');
    this.name = 'CustomerNotFoundError';
  }
}
