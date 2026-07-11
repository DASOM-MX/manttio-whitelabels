import type { Db } from '../../database/client';
import {
  findTemplateById,
  insertTemplate,
  listTemplates,
  updateTemplateContent,
  updateTemplateStatus,
} from '../repository/report-templates.repository';
import type { ReportTemplateRow, TemplateSection } from '../types/report-templates.types';
import type { ListTemplatesQuery, SaveTemplateInput } from '../validators/report-templates.validator';
import { TemplateStatus } from '../enums/report-templates.enum';

// Draft-only editing (06 §5.2): PATCH against active/disabled → 409.
export class TemplateNotDraftError extends Error {}
// deactivate is the active → draft edit path; anything else → 409.
export class TemplateNotActiveError extends Error {}
// `disabled` is terminal — no transition leaves it; re-disable → 409.
export class TemplateAlreadyDisabledError extends Error {}

/** Server-authoritative normalization: mint missing section/question ids and
 *  re-derive `order` from array position — the arrays are the truth. */
const normalizeSections = (sections: SaveTemplateInput['sections']): TemplateSection[] =>
  sections.map((s, si) => ({
    id: s.id || crypto.randomUUID(),
    order: si,
    title: s.title,
    columns: s.columns,
    questions: s.questions.map((q, qi) => ({
      id: q.id || crypto.randomUUID(),
      order: qi,
      label: q.label,
      datatype: q.datatype,
      required: q.required,
      ...(q.options ? { options: q.options } : {}),
      // Validator guarantees unit ⇒ datatype === 'number' (06 §5.1 rule).
      ...(q.unit ? { unit: q.unit } : {}),
      ...(q.constraints && Object.keys(q.constraints).length
        ? { constraints: q.constraints }
        : {}),
    })),
  }));

export const getTemplates = (db: Db, query: ListTemplatesQuery) =>
  listTemplates(db, { status: query.status, page: query.page, limit: query.limit });

export const getTemplate = (db: Db, id: string) => findTemplateById(db, id);

export const createTemplate = (db: Db, input: SaveTemplateInput): Promise<ReportTemplateRow> =>
  insertTemplate(db, {
    name: input.name,
    description: input.description ?? null,
    sections: normalizeSections(input.sections),
  });

export const editTemplate = async (
  db: Db,
  id: string,
  input: SaveTemplateInput,
): Promise<ReportTemplateRow | null> => {
  const target = await findTemplateById(db, id);
  if (!target) return null;
  if (target.status !== TemplateStatus.Draft) throw new TemplateNotDraftError();
  return updateTemplateContent(db, id, {
    name: input.name,
    description: input.description ?? null,
    sections: normalizeSections(input.sections),
  });
};

export const activateTemplate = async (db: Db, id: string): Promise<ReportTemplateRow | null> => {
  const target = await findTemplateById(db, id);
  if (!target) return null;
  if (target.status !== TemplateStatus.Draft) throw new TemplateNotDraftError();
  return updateTemplateStatus(db, id, { status: TemplateStatus.Active });
};

export const deactivateTemplate = async (db: Db, id: string): Promise<ReportTemplateRow | null> => {
  const target = await findTemplateById(db, id);
  if (!target) return null;
  if (target.status !== TemplateStatus.Active) throw new TemplateNotActiveError();
  return updateTemplateStatus(db, id, { status: TemplateStatus.Draft });
};

export const disableTemplate = async (
  db: Db,
  id: string,
  reason: string,
  actorId: string,
): Promise<ReportTemplateRow | null> => {
  const target = await findTemplateById(db, id);
  if (!target) return null;
  if (target.status === TemplateStatus.Disabled) throw new TemplateAlreadyDisabledError();
  return updateTemplateStatus(db, id, {
    status: TemplateStatus.Disabled,
    disabledReason: reason,
    disabledBy: actorId,
    disabledAt: new Date(),
  });
};
