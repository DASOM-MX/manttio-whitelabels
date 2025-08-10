/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { UploadService } from './upload.service';
import { UploadController } from './upload.controller';

@Module({
    controllers: [UploadController],
    providers: [
        UploadService
    ],
    exports: [UploadService], // Exporting UploadService to be used in other modules
})
export class UploadModule { }