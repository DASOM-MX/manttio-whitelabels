/* eslint-disable prettier/prettier */
// auth/auth.module.ts
import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './jwt.strategy';
import { AuthController } from './auth.controller';
//import { UserRepository } from '../user/repositories/user.repository';
//import { UserJsonRepository } from '../user/repositories/user-json.repository';
import { UserModule } from 'src/user/user.module';

@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      secret: 'JWT_SECRET_KEY',
      signOptions: { expiresIn: '7d' },
    }),
    UserModule
  ],
  providers: [
    AuthService,
    JwtStrategy,
    //{ provide: UserRepository, useClass: UserJsonRepository },
  ],
  controllers: [AuthController],
})
export class AuthModule { }