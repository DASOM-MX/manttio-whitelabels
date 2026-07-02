import { z } from 'zod';
import type { ReportType } from '../enums/reports.enum';

export const minisplitDataSchema = z.object({
  is_operating: z.boolean(),
  remote_working: z.boolean(),
  amperage: z.string(),
  filter: z.boolean(),
  inner_voltage: z.string(),
  unusual_noise: z.boolean(),
  observations: z.string().default(''),
});

export const chillerDataSchema = z.object({
  is_operating: z.boolean(),
  inner_temperature: z.string(),
  outer_temperature: z.string(),
  inner_voltage: z.string(),
  plc_keys_working: z.boolean(),
  motor_amperage: z.string(),
  system_pressure_1: z.string(),
  system_pressure_2: z.string(),
  system_pressure_3: z.string(),
  oil_pressure: z.string(),
  oil_level: z.string(),
  flux_switch_working: z.boolean(),
  unusual_noise: z.boolean(),
  observations: z.string().default(''),
});

export const umaDataSchema = z.object({
  is_operating: z.boolean(),
  air_band_adjustment: z.boolean(),
  inner_temperature: z.string(),
  outer_temperature: z.string(),
  air_good_quality: z.boolean(),
  inner_voltage: z.string(),
  motor_amperage: z.string(),
  unusual_noise: z.boolean(),
  observations: z.string().default(''),
});

// One zod schema per report variant. The variant keys mirror `reportTypes` in
// enums/reports.enum.ts — add a new variant in both places.
export const reportSchemas = {
  minisplit: minisplitDataSchema,
  chiller: chillerDataSchema,
  uma: umaDataSchema,
} as const;

export type MinisplitData = z.infer<typeof minisplitDataSchema>;
export type ChillerData = z.infer<typeof chillerDataSchema>;
export type UmaData = z.infer<typeof umaDataSchema>;
export type ReportData = MinisplitData | ChillerData | UmaData;

export const reportPayloadSchema = z.discriminatedUnion('report_type', [
  z.object({ report_type: z.literal('minisplit'), data: minisplitDataSchema }),
  z.object({ report_type: z.literal('chiller'), data: chillerDataSchema }),
  z.object({ report_type: z.literal('uma'), data: umaDataSchema }),
]);

export const isReportType = (value: string): value is ReportType =>
  Object.prototype.hasOwnProperty.call(reportSchemas, value);

export const validateReportData = (reportType: string, data: unknown) => {
  if (!isReportType(reportType)) {
    throw new Error(`Unknown report_type: ${reportType}`);
  }
  return reportSchemas[reportType].parse(data);
};
