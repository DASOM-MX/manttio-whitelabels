import { PartialType } from '@nestjs/mapped-types';
import { CreateReportDto } from './create-report.dto';
import { BaseReportDto } from './base-report.dto';

export class UpdateReportDto extends PartialType(BaseReportDto) { }
