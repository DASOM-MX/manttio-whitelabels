/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable prettier/prettier */
import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFiles
} from '@nestjs/common';
import { ReportsService } from './reports.service';
import { CreateReportDto } from './dto/create-report.dto';
import { UpdateReportDto } from './dto/update-report.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FileFieldsInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import * as sharp from 'sharp';
import { MinisplitReportDto } from './dto/minisplit-report.dto';
import { ChillerReportDto } from './dto/chiller-report.dto';
import { UmaReportDto } from './dto/uma-report.dto';

@Controller('reports')
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) { }

  @Post()
  @UseInterceptors(FileFieldsInterceptor([
    { name: 'pictures', maxCount: 3 },
    { name: 'signature', maxCount: 1 }]))
  async create(@UploadedFiles() files: { pictures?: Express.Multer.File[], signature?: Express.Multer.File[] },
    @Body() dto: MinisplitReportDto | ChillerReportDto | UmaReportDto) {
    console.log("Verifying files:", files);
    console.log(files);


    const pictures = files.pictures || [];
    const signature = files.signature && files.signature.length > 0 ? files.signature[0] : null;
    return await this.reportsService.create(dto, pictures, signature);
  }


  @Get()
  findAll(@Query('userId') userId?: string) {
    if (userId) {
      return this.reportsService.findByUser(userId);
    }
    return this.reportsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.reportsService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateReportDto: UpdateReportDto) {
    return this.reportsService.update(+id, updateReportDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.reportsService.remove(+id);
  }


}
