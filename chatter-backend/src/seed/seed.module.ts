import { Module } from '@nestjs/common';
import { ConversationsModule } from '../conversations/conversations.module.js';
import { MessagesModule } from '../messages/messages.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { UsersModule } from '../users/users.module.js';
import { SeedService } from './seed.service.js';

@Module({
  imports: [UsersModule, ConversationsModule, MessagesModule, StorageModule],
  providers: [SeedService],
})
export class SeedModule {}
