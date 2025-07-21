/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { ReportsRepository } from './repositories/reports.repository';
import { ReportsJsonRepository } from './repositories/reports-json.repository';

@Module({
  controllers: [ReportsController],
  providers: [
    ReportsService,
    { provide: ReportsRepository, useClass: ReportsJsonRepository },
  ],
})
export class ReportsModule { }