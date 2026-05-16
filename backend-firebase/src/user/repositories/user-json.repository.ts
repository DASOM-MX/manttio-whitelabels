/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable prettier/prettier */
import { Injectable } from '@nestjs/common';
import { UserRepository } from './user.repository';
import { User } from '../entities/user.entity';
import { CreateUserDto } from '../dto/create-user.dto';
import { v4 as uuid } from 'uuid';

// @Injectable()
// export class UserJsonRepository implements UserRepository {
//     private users: User[] = []; // in-memory DB

//     constructor() {
//         console.log('Instancia de UserJsonRepository creada');
//     }

//     async findAll(): Promise<User[]> {
//         console.log('Usuarios actuales:', this.users);

//         return this.users;
//     }

//     async findOne(id: number): Promise<User | undefined> {
//         return this.users.find(u => u.id === id);
//     }

//     async create(dto: CreateUserDto): Promise<User> {
//         const user: User = { id: uuid(), name: dto.name, email: dto.email, password: dto.password };
//         this.users.push(user);
//         return user;
//     }

//     async findByEmail(email: string) {
//         return this.users.find(u => u.email === email)

//     }
// }