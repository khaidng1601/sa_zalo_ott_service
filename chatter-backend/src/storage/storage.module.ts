import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ConversationsModule } from '../conversations/conversations.module.js';
import { StorageService } from './storage.service.js';
import { UploadsController } from './uploads.controller.js';

@Module({
  imports: [AuthModule, ConversationsModule],
  controllers: [UploadsController],
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
