/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable prettier/prettier */
import { Injectable } from '@nestjs/common';
import { CreateReportDto } from './dto/create-report.dto';
import { UpdateReportDto } from './dto/update-report.dto';
import { ReportsRepository } from './repositories/reports.repository';
import { UploadService } from '../storage/upload.service';

@Injectable()
export class ReportsService {
  constructor(private readonly repo: ReportsRepository, private readonly uploadService: UploadService) { }

  async create(dto: CreateReportDto, files: Express.Multer.File[]) {
    const pictureUrls = await this.uploadService.uploadFiles(files);
    dto.pictures = pictureUrls;
    const report = await this.repo.create(dto);
    return report;
  }

  findAll() {
    return this.repo.findAll();
  }

  findByUser(userId: string) {
    return this.repo.findByUser(userId);
  }

  findOne(id: number) {
    return `This action returns a #${id} report`;
  }

  update(id: number, updateReportDto: UpdateReportDto) {
    return `This action updates a #${id} report`;
  }

  remove(id: number) {
    return `This action removes a #${id} report`;
  }
}
