import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UsersService } from './users.service.js';
import { ContactRecord, ContactSchema } from './schemas/contact.schema.js';
import { UserRecord, UserSchema } from './schemas/user.schema.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: UserRecord.name, schema: UserSchema },
      { name: ContactRecord.name, schema: ContactSchema },
    ]),
  ],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
