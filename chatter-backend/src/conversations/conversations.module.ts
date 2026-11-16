import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthGuard } from '../auth/auth.guard.js';
import { AuthModule } from '../auth/auth.module.js';
import { UsersModule } from '../users/users.module.js';
import { ConversationsResolver } from './conversations.resolver.js';
import { ConversationsService } from './conversations.service.js';
import {
  ConversationMemberRecord,
  ConversationMemberSchema,
} from './schemas/conversation-member.schema.js';
import {
  ConversationRecord,
  ConversationSchema,
} from './schemas/conversation.schema.js';

@Module({
  imports: [
    AuthModule,
    UsersModule,
    MongooseModule.forFeature([
      { name: ConversationRecord.name, schema: ConversationSchema },
      {
        name: ConversationMemberRecord.name,
        schema: ConversationMemberSchema,
      },
    ]),
  ],
  providers: [ConversationsResolver, ConversationsService, AuthGuard],
})
export class ConversationsModule {}
