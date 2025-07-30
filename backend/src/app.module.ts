import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ReportsModule } from './reports/reports.module';
import { UserModule } from './user/user.module';
import { CustomersModule } from './customer/customer.module';

@Module({
  imports: [ReportsModule, UserModule, CustomersModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
