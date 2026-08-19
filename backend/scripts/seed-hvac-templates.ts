// Seed the three legacy HVAC templates (Minisplit, Chiller, UMA).
// Reproduces the original buildFields() definitions from the field app with proper typing:
// boolean instead of Sí/No select, number + magnitude instead of stringified readings.
// Idempotent by name — run this once per tenant. Not part of provisioning; a new tenant
// starts empty and authors its own templates in superadmin.
//
// usage: pnpm seed:hvac-templates

import { config } from 'dotenv';
config({ path: '.dev.vars' });

import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq } from 'drizzle-orm';
import * as schema from '../src/modules/database/schema';
import { TemplateStatus, QuestionDatatype, Magnitude } from '../src/modules/report-templates/enums/report-templates.enum';
import type { TemplateSection } from '../src/modules/report-templates/types/report-templates.types';
import { nanoid } from 'nanoid';

const main = async () => {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set (check `.dev.vars`).');
    process.exit(1);
  }

  const sql = neon(url);
  const db = drizzle(sql, { schema });

  // Helper to check if template exists
  const exists = async (name: string) => {
    const result = await db
      .select({ id: schema.reportTemplates.id })
      .from(schema.reportTemplates)
      .where(eq(schema.reportTemplates.name, name))
      .limit(1);
    return result.length > 0;
  };

  // Minisplit template
  const minisplitName = 'Minisplit';
  if (!(await exists(minisplitName))) {
    const minisplitSections: TemplateSection[] = [
      {
        id: nanoid(),
        order: 1,
        title: 'Mantenimiento Minisplit',
        columns: 2,
        questions: [
          {
            id: nanoid(),
            order: 1,
            label: '¿Equipo se encuentra operando?',
            datatype: QuestionDatatype.Boolean,
            required: false,
          },
          {
            id: nanoid(),
            order: 2,
            label: '¿Control remoto funciona?',
            datatype: QuestionDatatype.Boolean,
            required: false,
          },
          {
            id: nanoid(),
            order: 3,
            label: 'Amperaje general',
            datatype: QuestionDatatype.Number,
            required: false,
            unit: Magnitude.Ampere,
          },
          {
            id: nanoid(),
            order: 4,
            label: '¿Cuenta con filtro de evaporador?',
            datatype: QuestionDatatype.Boolean,
            required: false,
          },
          {
            id: nanoid(),
            order: 5,
            label: 'Voltaje de entrada',
            datatype: QuestionDatatype.Number,
            required: false,
            unit: Magnitude.Volt,
          },
          {
            id: nanoid(),
            order: 6,
            label: '¿Ruido fuera de lo normal?',
            datatype: QuestionDatatype.Boolean,
            required: false,
          },
          {
            id: nanoid(),
            order: 7,
            label: 'Observaciones',
            datatype: QuestionDatatype.Textarea,
            required: false,
          },
        ],
      },
    ];
    await db.insert(schema.reportTemplates).values({
      name: minisplitName,
      status: TemplateStatus.Active,
      sections: minisplitSections,
    });
    console.log(`Seeded template: ${minisplitName}`);
  } else {
    console.log(`Template ${minisplitName} already exists.`);
  }

  // Chiller template
  const chillerName = 'Chiller';
  if (!(await exists(chillerName))) {
    const chillerSections: TemplateSection[] = [
      {
        id: nanoid(),
        order: 1,
        title: 'Mantenimiento Chiller',
        columns: 2,
        questions: [
          {
            id: nanoid(),
            order: 1,
            label: '¿Equipo se encuentra operando?',
            datatype: QuestionDatatype.Boolean,
            required: false,
          },
          {
            id: nanoid(),
            order: 2,
            label: 'Temperatura de entrada',
            datatype: QuestionDatatype.Number,
            required: false,
            unit: Magnitude.Celsius,
          },
          {
            id: nanoid(),
            order: 3,
            label: 'Temperatura de salida',
            datatype: QuestionDatatype.Number,
            required: false,
            unit: Magnitude.Celsius,
          },
          {
            id: nanoid(),
            order: 4,
            label: 'Voltaje interior',
            datatype: QuestionDatatype.Number,
            required: false,
            unit: Magnitude.Volt,
          },
          {
            id: nanoid(),
            order: 5,
            label: '¿PLC funciona?',
            datatype: QuestionDatatype.Boolean,
            required: false,
          },
          {
            id: nanoid(),
            order: 6,
            label: 'Amperaje del motor',
            datatype: QuestionDatatype.Number,
            required: false,
            unit: Magnitude.Ampere,
          },
          {
            id: nanoid(),
            order: 7,
            label: 'Presión del sistema 1',
            datatype: QuestionDatatype.Number,
            required: false,
            unit: Magnitude.Psi,
          },
          {
            id: nanoid(),
            order: 8,
            label: 'Presión del sistema 2',
            datatype: QuestionDatatype.Number,
            required: false,
            unit: Magnitude.Psi,
          },
          {
            id: nanoid(),
            order: 9,
            label: 'Presión del sistema 3',
            datatype: QuestionDatatype.Number,
            required: false,
            unit: Magnitude.Psi,
          },
          {
            id: nanoid(),
            order: 10,
            label: 'Presión de aceite',
            datatype: QuestionDatatype.Number,
            required: false,
            unit: Magnitude.Psi,
          },
          {
            id: nanoid(),
            order: 11,
            label: 'Nivel de aceite',
            datatype: QuestionDatatype.Text,
            required: false,
          },
          {
            id: nanoid(),
            order: 12,
            label: 'Switch de flujo funciona',
            datatype: QuestionDatatype.Boolean,
            required: false,
          },
          {
            id: nanoid(),
            order: 13,
            label: 'Ruido inusual',
            datatype: QuestionDatatype.Boolean,
            required: false,
          },
          {
            id: nanoid(),
            order: 14,
            label: 'Observaciones',
            datatype: QuestionDatatype.Textarea,
            required: false,
          },
        ],
      },
    ];
    await db.insert(schema.reportTemplates).values({
      name: chillerName,
      status: TemplateStatus.Active,
      sections: chillerSections,
    });
    console.log(`Seeded template: ${chillerName}`);
  } else {
    console.log(`Template ${chillerName} already exists.`);
  }

  // UMA template
  const umaName = 'UMA';
  if (!(await exists(umaName))) {
    const umaSections: TemplateSection[] = [
      {
        id: nanoid(),
        order: 1,
        title: 'Mantenimiento UMA',
        columns: 2,
        questions: [
          {
            id: nanoid(),
            order: 1,
            label: '¿Se encuentra operando?',
            datatype: QuestionDatatype.Boolean,
            required: false,
          },
          {
            id: nanoid(),
            order: 2,
            label: '¿Se ajustó la banda?',
            datatype: QuestionDatatype.Boolean,
            required: false,
          },
          {
            id: nanoid(),
            order: 3,
            label: 'Temperatura de entrada',
            datatype: QuestionDatatype.Number,
            required: false,
            unit: Magnitude.Celsius,
          },
          {
            id: nanoid(),
            order: 4,
            label: 'Temperatura de salida',
            datatype: QuestionDatatype.Number,
            required: false,
            unit: Magnitude.Celsius,
          },
          {
            id: nanoid(),
            order: 5,
            label: 'Rejilla de aire en buenas condiciones',
            datatype: QuestionDatatype.Boolean,
            required: false,
          },
          {
            id: nanoid(),
            order: 6,
            label: 'Voltaje de entrada',
            datatype: QuestionDatatype.Number,
            required: false,
            unit: Magnitude.Volt,
          },
          {
            id: nanoid(),
            order: 7,
            label: 'Amperaje del motor',
            datatype: QuestionDatatype.Number,
            required: false,
            unit: Magnitude.Ampere,
          },
          {
            id: nanoid(),
            order: 8,
            label: 'Ruido inusual',
            datatype: QuestionDatatype.Boolean,
            required: false,
          },
          {
            id: nanoid(),
            order: 9,
            label: 'Observaciones',
            datatype: QuestionDatatype.Textarea,
            required: false,
          },
        ],
      },
    ];
    await db.insert(schema.reportTemplates).values({
      name: umaName,
      status: TemplateStatus.Active,
      sections: umaSections,
    });
    console.log(`Seeded template: ${umaName}`);
  } else {
    console.log(`Template ${umaName} already exists.`);
  }

  console.log('Seed complete.');
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
