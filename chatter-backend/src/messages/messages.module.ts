import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module.js';
import { ConversationsModule } from '../conversations/conversations.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { UsersModule } from '../users/users.module.js';
import { MessagesResolver } from './messages.resolver.js';
import { MessagesService } from './messages.service.js';
import { MessageRecord, MessageSchema } from './schemas/message.schema.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: MessageRecord.name, schema: MessageSchema },
    ]),
    AuthModule,
    ConversationsModule,
    UsersModule,
    StorageModule,
  ],
  providers: [MessagesResolver, MessagesService],
  exports: [MessagesService],
})
export class MessagesModule {}
