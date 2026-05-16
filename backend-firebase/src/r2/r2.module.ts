/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { R2Service } from './r2.service';
import { R2TestController } from './r2.controller';

@Module({
    imports: [ConfigModule],
    providers: [R2Service],
    controllers: [R2TestController],
    exports: [R2Service], // Para usar en otros módulos
})
export class R2Module { }