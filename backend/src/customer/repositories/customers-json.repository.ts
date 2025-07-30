/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/require-await */
import { Injectable } from '@nestjs/common';
import { CustomersRepository } from './customers.repository';
import { Customer } from '../entities/customer.entity';
import { CreateCustomerDto } from '../dto/create-customer.dto';
import { v4 as uuid } from 'uuid';

@Injectable()
export class CustomersJsonRepository implements CustomersRepository {
    private customers: Customer[] = [];

    async findAll(): Promise<Customer[]> {
        return this.customers;
    }

    async findOne(id: string): Promise<Customer | undefined> {
        return this.customers.find(c => c.id === id);
    }

    async create(dto: CreateCustomerDto): Promise<Customer> {
        const customer: Customer = { id: uuid(), name: dto.name, identification: dto.identification, phone: dto.phone, email: dto.email, observation: dto.observation };
        this.customers.push(customer);
        return customer;
    }
}
