import { z } from 'zod';
import { AssignmentRole } from '../enums/assignments.enum';
import { StorageNodeType } from '../enums/storage-nodes.enum';

const locationName = z.string().trim().min(1).max(120);
const shortText = z.string().trim().min(1).max(500);
const longText = z.string().trim().min(1).max(2000);

// WGS84, same shape as the report signing coords (`reports.signed_latitude`).
const latitude = z.coerce.number().finite().min(-90).max(90);
const longitude = z.coerce.number().finite().min(-180).max(180);

export const createWarehouseSchema = z
  .object({
    name: locationName,
    // Root when absent. The service checks the parent is itself a root —
    // v1 nests exactly one level (`400 invalid_parent`).
    parentId: z.string().uuid().optional(),
    address: shortText.optional(),
    locationReference: shortText.optional(),
    latitude: latitude.optional(),
    longitude: longitude.optional(),
    notes: longText.optional(),
  })
  .superRefine((v, ctx) => {
    // Mirrors `warehouses_coords_pair_check` — a lone coordinate is a partly
    // filled form, and answering it from the DB would be a 500.
    if ((v.latitude === undefined) !== (v.longitude === undefined)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [v.latitude === undefined ? 'latitude' : 'longitude'],
        message: 'latitude and longitude travel together',
      });
    }
    // Mirrors `warehouses_locatable_check` (client requirement 2026-08-08): a
    // warehouse people cannot find is not a warehouse.
    if (v.locationReference === undefined && v.latitude === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['locationReference'],
        message: 'a warehouse needs a location reference or a coordinate pair',
      });
    }
  });

/** Every field is `.nullable()` so a PATCH can CLEAR one — `undefined` means
 *  "leave it", `null` means "erase it". The locatability rule can only be
 *  judged on the merged row, so the service owns it (`400
 *  warehouse_not_locatable`); the coordinate pair is enforced here instead,
 *  by requiring both to be sent together. */
export const updateWarehouseSchema = z
  .object({
    name: locationName.optional(),
    parentId: z.string().uuid().nullable().optional(),
    address: shortText.nullable().optional(),
    locationReference: shortText.nullable().optional(),
    latitude: latitude.nullable().optional(),
    longitude: longitude.nullable().optional(),
    notes: longText.nullable().optional(),
  })
  .superRefine((v, ctx) => {
    if ((v.latitude === undefined) !== (v.longitude === undefined)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [v.latitude === undefined ? 'latitude' : 'longitude'],
        message: 'send latitude and longitude together, or neither',
      });
    }
  });

/** `POST /warehouses/:id/assign-technician` (02 §2). The path keeps its name
 *  from the original spec; the body gained `role` when the column did (user
 *  2026-08-21) — the DB pairs assignee and role, so an assignment without one
 *  cannot be stored. `userId: null` unassigns and takes no role. */
export const assignWarehouseSchema = z
  .object({
    userId: z.string().uuid().nullable(),
    role: z.nativeEnum(AssignmentRole).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.userId !== null && v.role === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['role'],
        message: 'role is required when assigning a user',
      });
    }
    if (v.userId === null && v.role !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['role'],
        message: 'role must be omitted when unassigning',
      });
    }
  });

export const createStorageNodeSchema = z
  .object({
    // Root of the warehouse's structure when absent — and a root may be any
    // type (01 §2, owner 2026-07-20).
    parentNodeId: z.string().uuid().optional(),
    type: z.nativeEnum(StorageNodeType),
    name: locationName,
    description: longText.optional(),
    locationReference: shortText.optional(),
    assignedUserId: z.string().uuid().optional(),
    assignmentRole: z.nativeEnum(AssignmentRole).optional(),
  })
  .superRefine((v, ctx) => {
    // Mirrors `storage_nodes_assignment_role_check`. The LEVEL rule (only a
    // warehouse or storage unit may carry an assignee) needs the node's type
    // in context and lives in the service.
    if ((v.assignedUserId === undefined) !== (v.assignmentRole === undefined)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['assignmentRole'],
        message: 'an assignee and its role travel together',
      });
    }
  });

/** `type` and `parentNodeId` are absent by design (01 §2): the type is
 *  immutable after create and moving a node is out of v1. The assignment pair
 *  is judged on the merged row by the service (`400 incomplete_assignment`),
 *  because a PATCH can legitimately send just one side — `{ assignmentRole:
 *  'leader' }` on a node that already has a user is a role change, not a
 *  half-assignment. */
export const updateStorageNodeSchema = z.object({
  name: locationName.optional(),
  description: longText.nullable().optional(),
  locationReference: shortText.nullable().optional(),
  assignedUserId: z.string().uuid().nullable().optional(),
  assignmentRole: z.nativeEnum(AssignmentRole).nullable().optional(),
});

/** Deliberately unpaged, unlike the materials and movements lists (02 §3/§4).
 *  A tenant has tens of warehouses, every picker wants all of them, and the
 *  technician self-checkout source list would be wrong if it were truncated —
 *  the same call the services catalog makes (18 §4). */
export const listWarehousesQuerySchema = z.object({
  parentId: z.string().uuid().optional(),
});

/** Absent `parentNodeId` = the warehouse's root nodes. The tree loads one
 *  level per call (04 §2), so this is the whole query. */
export const listStorageNodesQuerySchema = z.object({
  parentNodeId: z.string().uuid().optional(),
});

/** Absent `nodeId` = everything in the warehouse, at any depth. */
export const warehouseStockQuerySchema = z.object({
  nodeId: z.string().uuid().optional(),
});

export type CreateWarehouseInput = z.infer<typeof createWarehouseSchema>;
export type UpdateWarehouseInput = z.infer<typeof updateWarehouseSchema>;
export type AssignWarehouseInput = z.infer<typeof assignWarehouseSchema>;
export type CreateStorageNodeInput = z.infer<typeof createStorageNodeSchema>;
export type UpdateStorageNodeInput = z.infer<typeof updateStorageNodeSchema>;
export type ListWarehousesQuery = z.infer<typeof listWarehousesQuerySchema>;
export type ListStorageNodesQuery = z.infer<typeof listStorageNodesQuerySchema>;
export type WarehouseStockQuery = z.infer<typeof warehouseStockQuerySchema>;
