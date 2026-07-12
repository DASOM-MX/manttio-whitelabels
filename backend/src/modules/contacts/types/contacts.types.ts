import type { contacts } from '../models/contact.model';

export type ContactRow = typeof contacts.$inferSelect;
export type NewContact = typeof contacts.$inferInsert;
export type UpdateContactFields = Partial<Pick<ContactRow, 'name' | 'role' | 'phone' | 'email'>>;
