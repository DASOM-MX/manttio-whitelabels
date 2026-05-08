/* eslint-disable prettier/prettier */
import { Controller, Get, Post, Param } from '@nestjs/common';
import { R2Service } from './r2.service';

@Controller('r2-test')
export class R2TestController {
    constructor(private readonly r2Service: R2Service) { }

    // Endpoint para probar conexión básica
    @Get('connection')
    async testConnection() {
        return await this.r2Service.testConnection();
    }

    // Endpoint para probar acceso al bucket
    @Get('bucket')
    async testBucket() {
        return await this.r2Service.testBucketAccess();
    }

    // Endpoint para probar subida
    @Post('upload')
    async testUpload() {
        return await this.r2Service.testUpload();
    }

    // Endpoint para probar descarga
    @Get('download/:key')
    async testDownload(@Param('key') key: string) {
        return await this.r2Service.testDownload(key);
    }

    // Endpoint para ejecutar todas las pruebas
    @Get('full-test')
    async runFullTest() {
        return await this.r2Service.runFullTest();
    }
}