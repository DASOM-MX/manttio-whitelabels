import { sql } from 'drizzle-orm';
import { check, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from '../../users/models/users.model';
import type { TemplateSection } from '../types/report-templates.types';

// Tenant-designed report templates (superadmin plan 06 §5). Sections/questions
// are a jsonb doc — the template is read and written whole (builder semantics),
// never queried per-question. Lifecycle over soft delete: `disabled` is the
// terminal state (audited via reason/by/at), there is no delete endpoint.
export const reportTemplates = pgTable(
  'report_templates',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    description: text('description'),
    status: text('status').$type<'draft' | 'active' | 'disabled'>().notNull().default('draft'),
    sections: jsonb('sections').$type<TemplateSection[]>().notNull(),
    disabledReason: text('disabled_reason'),
    disabledBy: uuid('disabled_by').references(() => users.id, { onDelete: 'restrict' }),
    disabledAt: timestamp('disabled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check('report_templates_status_check', sql`${table.status} in ('draft', 'active', 'disabled')`),
  ],
);
