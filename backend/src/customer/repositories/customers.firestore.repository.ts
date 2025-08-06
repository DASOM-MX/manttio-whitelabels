/* eslint-disable @typescript-eslint/no-redundant-type-constituents */
/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable prettier/prettier */

import { Injectable } from '@nestjs/common';
import { CustomersRepository } from './customers.repository';
import { Customer } from '../entities/customer.entity';
import { CreateCustomerDto } from '../dto/create-customer.dto';
import { db } from '../../../libs/firebase/firebase';
import { v4 as uuid } from 'uuid';


@Injectable()
export class CustomersFirestoreRepository implements CustomersRepository {
    private collection = db.collection('customers');

    async findAll(): Promise<Customer[]> {
        const snapshot = await this.collection.get();
        return snapshot.docs.map(doc => doc.data() as Customer);
    }

    async findOne(id: number): Promise<Customer | undefined> {
        const doc = await this.collection.doc(id.toString()).get();
        return doc.exists ? (doc.data() as Customer) : undefined;
    }

    async create(dto: CreateCustomerDto): Promise<Customer> {
        const customer: Customer = { id: uuid(), ...dto };
        await this.collection.doc(customer.id).set(customer);
        return customer;
    }

    async findByEmail(email: string): Promise<any | null> {
        const snapshot = await this.collection.where('email', '==', email).limit(1).get();
        if (snapshot.empty) {
            return null;
        }
        const doc = snapshot.docs[0];
        return {
            id: doc.id,
            ...doc.data(),
        }
    }
}