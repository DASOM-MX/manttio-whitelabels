import z from 'zod';

/**
 * POST /portal/service-requests — create a new service request.
 * `customerId` and `contactId` come from the token, never the body.
 * `equipmentId` is optional; the customer can file without picking a unit.
 * `description` is bounded 10..300 chars server-side (owner, 2026-09-02).
 * `evidence` is up to 3 URLs (upload route, CP-2, provides them).
 */
export const createServiceRequestSchema = z.object({
  equipmentId: z.string().uuid().optional(),
  description: z
    .string()
    .min(10, 'Descripción es muy corta (mín. 10 caracteres)')
    .max(300, 'Descripción es muy larga (máx. 300 caracteres)'),
  evidence: z.array(z.string().url()).max(3, 'Máximo 3 imágenes').optional(),
});

export type CreateServiceRequestInput = z.infer<typeof createServiceRequestSchema>;

/**
 * POST /portal/service-requests/:id/answer — provide info when asked (needs_info state).
 * Appends an `info_provided` event and returns the request to `in_review`.
 */
export const answerServiceRequestSchema = z.object({
  answer: z.string().min(1, 'Respuesta es requerida'),
});

export type AnswerServiceRequestInput = z.infer<typeof answerServiceRequestSchema>;
