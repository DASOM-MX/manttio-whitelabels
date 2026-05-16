/* eslint-disable prettier/prettier */
import { Customer } from '../entities/customer.entity';
import { CreateCustomerDto } from '../dto/create-customer.dto';

export abstract class CustomersRepository {
    abstract findAll(): Promise<Customer[]>;
    abstract findOne(id: string): Promise<Customer | undefined>;
    abstract create(dto: CreateCustomerDto): Promise<Customer>;
}