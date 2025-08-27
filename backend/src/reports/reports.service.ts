/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable prettier/prettier */
import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateReportDto } from './dto/create-report.dto';
import { UpdateReportDto } from './dto/update-report.dto';
import { ReportsRepository } from './repositories/reports.repository';
import { UploadService } from '../storage/upload.service';
import { MinisplitReport } from './entities/minisplit-report.entity';
import { MinisplitReportDto } from './dto/minisplit-report.dto';
import { ChillerReportDto } from './dto/chiller-report.dto';
import { UmaReportDto } from './dto/uma-report.dto';
import { BaseReport } from './entities/base-report.entity';

@Injectable()
export class ReportsService {
  constructor(private readonly repo: ReportsRepository, private readonly uploadService: UploadService) { }

  async create(dto: MinisplitReportDto | ChillerReportDto | UmaReportDto, files: Express.Multer.File[], signature: Express.Multer.File | null) {

    const dtoWithCommon = dto as { pictures?: string[]; signature?: string; signed_by?: string; report_status?: boolean };

    //Subir imagenes 
    const pictureUrls = await this.uploadService.uploadFiles(files);
    dtoWithCommon.pictures = pictureUrls;

    //Subir firma
    if (signature) {
      const signatureUrl = await this.uploadService.uploadFile(signature);
      dtoWithCommon.signature = signatureUrl;

      //dto.signature = signatureUrl;

    } else if (dtoWithCommon.signature && dtoWithCommon.signature.startsWith('data:image')) {
      // Caso: firma enviada en Base64 desde el front
      const base64Data = dtoWithCommon.signature.split(',')[1];
      const buffer = Buffer.from(base64Data, 'base64');
      const signatureFile: Express.Multer.File = {
        fieldname: 'signature',
        originalname: `signature-${Date.now()}.png`,
        encoding: '7bit',
        mimetype: 'image/png',
        buffer: buffer,
        size: buffer.length,
        stream: null as any,
        destination: '',
        filename: '',
        path: ''

      };
      dtoWithCommon.signature = await this.uploadService.uploadFile(signatureFile);
    }

    //check if the report is signed
    dto.report_status = !!dto.signature && !!dto.signed_by;

    const report = await this.repo.create(dto);
    return report;
  }

  findAll() {
    return this.repo.findAll();
  }

  findByUser(userId: string) {
    return this.repo.findByUser(userId);
  }

  findOne(id: string) {
    return this.repo.findOne(id);
  }

  async update(id: string, dto: UpdateReportDto) {
    //return `This action updates a #${id} report`;
    const existing = await this.repo.findOne(id);
    if (!existing) throw new NotFoundException(`Reporte ${id} no encontrado`);

    await this.repo.update(id, dto);
    return this.repo.findOne(id);
  }


  async updateSignature(id: string, signature: Express.Multer.File, signedBy: string) {

    const report = await this.repo.findOne(id);

    if (!report) throw new NotFoundException('Reporte no encontrado');

    if (signature) {
      const signatureUrl = await this.uploadService.uploadFile(signature);
      report.signature = signatureUrl;
      report.signed_by = signedBy;
      report.report_status = true;
    }

    return this.repo.update(id, report);
  }

  remove(id: number) {
    return `This action removes a #${id} report`;
  }


}
