/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { UserRepository } from './repositories/user.repository';
//import { UserJsonRepository } from './repositories/user-json.repository';
import { UserFirestoreRepository } from './repositories/user.firestore.repository';
@Module({
  controllers: [UserController],
  providers: [
    UserService,
    { provide: UserRepository, useClass: UserFirestoreRepository },
  ],
  exports: [
    UserService,
    UserRepository
  ]
})
export class UserModule { }
