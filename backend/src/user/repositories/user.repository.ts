/* eslint-disable prettier/prettier */
import { CreateUserDto } from "../dto/create-user.dto";
import { User } from "../entities/user.entity";

/* eslint-disable prettier/prettier */
export abstract class UserRepository {
    abstract findAll(): Promise<User[]>;
    abstract findOne(id: string): Promise<User | undefined>;
    abstract create(dto: CreateUserDto): Promise<User>;
    abstract findByEmail(email: string);
}