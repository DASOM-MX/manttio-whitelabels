/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { ReportsRepository } from './repositories/reports.repository';
//import { ReportsJsonRepository } from './repositories/reports-json.repository';
import { ReportFirestoreRepository } from './repositories/reports.firestore.repository';
import { UploadModule } from 'src/storage/upload.module';
@Module({
  controllers: [ReportsController],
  imports: [UploadModule],
  providers: [
    ReportsService,
    { provide: ReportsRepository, useClass: ReportFirestoreRepository },
  ],
})
export class ReportsModule { }