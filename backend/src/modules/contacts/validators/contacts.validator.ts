import { z } from 'zod';

// The contact's own fields (parent named separately).
const contactFields = {
  name: z.string().min(1),
  role: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
};

// POST /contacts — the parent client is named in the body.
export const createContactSchema = z.object({
  customerId: z.string().uuid(),
  ...contactFields,
});

// PATCH /contacts/:id — partial; the parent is immutable (no re-parenting).
export const updateContactSchema = z
  .object(contactFields)
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'no fields to update' });

// Inline shape when a customer is created/updated with its contacts in one call
// (the customers module delegates to this). No `customerId` — it's the customer
// being written; an optional `id` is tolerated and ignored (replace-all path).
export const nestedContactSchema = z.object({
  ...contactFields,
  id: z.string().uuid().optional(),
});

export type CreateContactInput = z.infer<typeof createContactSchema>;
export type UpdateContactInput = z.infer<typeof updateContactSchema>;
export type NestedContactInput = z.infer<typeof nestedContactSchema>;
