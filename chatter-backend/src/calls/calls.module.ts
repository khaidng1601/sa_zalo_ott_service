import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module.js';
import {
  ConversationMemberRecord,
  ConversationMemberSchema,
} from '../conversations/schemas/conversation-member.schema.js';
import {
  ConversationRecord,
  ConversationSchema,
} from '../conversations/schemas/conversation.schema.js';
import { CallsResolver } from './calls.resolver.js';
import { CallsGateway } from './calls.gateway.js';
import { CallsService } from './calls.service.js';
import {
  CallHistoryRecord,
  CallHistorySchema,
} from './schemas/call-history.schema.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ConversationRecord.name, schema: ConversationSchema },
      { name: ConversationMemberRecord.name, schema: ConversationMemberSchema },
      { name: CallHistoryRecord.name, schema: CallHistorySchema },
    ]),
    AuthModule,
  ],
  providers: [CallsGateway, CallsResolver, CallsService],
})
export class CallsModule {}
