/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ReportsModule } from './reports/reports.module';
import { UserModule } from './user/user.module';
import { CustomersModule } from './customer/customer.module';
import { AuthModule } from './auth/auth.module';
import { UploadModule } from './storage/upload.module';
import { ConfigModule } from '@nestjs/config';
import { R2Module } from './r2/r2.module';

@Module({
  imports: [ReportsModule, UserModule, CustomersModule, AuthModule, UploadModule, ConfigModule.forRoot({ isGlobal: true, }), R2Module],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
