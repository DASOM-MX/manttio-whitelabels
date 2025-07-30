/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Module } from '@nestjs/common';
import { CustomersService } from './customer.service';
import { CustomersController } from './customer.controller';
import { CustomersRepository } from './repositories/customers.repository';
import { CustomersJsonRepository } from './repositories/customers-json.repository';

@Module({
  controllers: [CustomersController],
  providers: [CustomersService,
    { provide: CustomersRepository, useClass: CustomersJsonRepository },
  ],
})
export class CustomersModule { }
