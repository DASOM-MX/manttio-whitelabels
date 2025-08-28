/* eslint-disable @typescript-eslint/no-redundant-type-constituents */
/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable prettier/prettier */
import { Injectable } from '@nestjs/common';
import { UserRepository } from './user.repository';
import { User } from '../entities/user.entity';
import { CreateUserDto } from '../dto/create-user.dto';
import { db } from '../../../libs/firebase/firebase';
import { v4 as uuid } from 'uuid';

@Injectable()
export class UserFirestoreRepository implements UserRepository {
    private collection = db.collection('users');

    async findAll(): Promise<User[]> {
        const snapshot = await this.collection.get();
        return snapshot.docs.map(doc => doc.data() as User);
    }

    async findOne(id: number): Promise<User | undefined> {
        const doc = await this.collection.doc(id.toString()).get();
        return doc.exists ? (doc.data() as User) : undefined;
    }

    async create(dto: CreateUserDto): Promise<User> {
        const docRef = this.collection.doc();
        const user: User = { id: docRef.id, ...dto };
        await docRef.set(user);
        return user;
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
        };
    }

}