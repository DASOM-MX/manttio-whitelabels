/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable prettier/prettier */
// auth/auth.service.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserRepository } from '../user/repositories/user.repository';
import * as bcrypt from 'bcrypt';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
    constructor(
        private readonly usersRepo: UserRepository,
        private readonly jwtService: JwtService,
    ) { }

    async register(dto: RegisterDto) {
        const hash = await bcrypt.hash(dto.password, 10);
        const user = await this.usersRepo.create({ ...dto, password: hash });
        const token = this.jwtService.sign({ sub: user.id });
        return { user, token };
    }

    async login(dto: LoginDto) {
        const user = await this.usersRepo.findByEmail(dto.email);
        if (!user) throw new UnauthorizedException('Invalid credentials');
        const match = await bcrypt.compare(dto.password, user.password);
        if (!match) throw new UnauthorizedException('Invalid credentials');
        const token = this.jwtService.sign({ sub: user.id });

        console.log('User login:', user.id, user.email);
        return { user, token };
    }

    async validateUser(userId: number) {
        return this.usersRepo.findOne(userId);
    }
}