/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { UserRepository } from './repositories/user.repository';
import { UserJsonRepository } from './repositories/user-json.repository';
@Module({
  controllers: [UserController],
  providers: [
    UserService,
    { provide: UserRepository, useClass: UserJsonRepository },
  ],
  exports: [
    UserService,
    UserRepository
  ]
})
export class UserModule { }
