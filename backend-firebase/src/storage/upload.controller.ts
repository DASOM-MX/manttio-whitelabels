/* eslint-disable prettier/prettier */
import { Controller, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadService } from './upload.service';
import multer from 'multer';

@Controller('upload')
export class UploadController {
    constructor(private readonly uploadService: UploadService) { }

    @Post('image')
    @UseInterceptors(FileInterceptor('file', { storage: multer.memoryStorage() }))
    async uploadImage(@UploadedFile() file: Express.Multer.File) {

        const url = await this.uploadService.uploadFile(file);
        return { url };
    }


}
