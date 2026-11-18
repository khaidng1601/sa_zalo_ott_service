import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ActivitiesService } from '../activities/activities.service.js';
import { ActivityEventType } from '../activities/schemas/user-activity.schema.js';
import { ConversationsService } from '../conversations/conversations.service.js';
import { MessageKind } from '../messages/entities/message.entity.js';
import { MessagesService } from '../messages/messages.service.js';
import { StorageService } from '../storage/storage.service.js';
import { UserRole } from '../users/entities/user.entity.js';
import { UsersService } from '../users/users.service.js';

@Injectable()
export class SeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
    private readonly conversationsService: ConversationsService,
    private readonly messagesService: MessagesService,
    private readonly storageService: StorageService,
    private readonly activitiesService: ActivitiesService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const nodeEnv = this.configService.get<string>('NODE_ENV');
    const seedFlag = this.configService.get<string>('SEED_DEMO_DATA');
    if (nodeEnv === 'test' || seedFlag === 'false') {
      return;
    }

    try {
      const existingAdmin =
        await this.usersService.findActiveByEmail('admin@chatter.vn');
      if (existingAdmin) {
        return;
      }

      this.logger.log('Seeding initial demo accounts, conversations, and analytics...');

      const admin = await this.usersService.createAccount({
        email: 'admin@chatter.vn',
        password: 'Admin@123456',
        displayName: 'Quản trị viên Hệ thống',
        role: UserRole.ADMIN,
      });

      const minh = await this.usersService.createAccount({
        email: 'minh.nguyen@chatter.vn',
        password: 'Password@123',
        displayName: 'Nguyễn Minh',
      });

      const lan = await this.usersService.createAccount({
        email: 'lan.tran@chatter.vn',
        password: 'Password@123',
        displayName: 'Trần Thị Lan',
      });

      const huy = await this.usersService.createAccount({
        email: 'huy.le@chatter.vn',
        password: 'Password@123',
        displayName: 'Lê Quốc Huy',
      });

      const allDemoUsers = [admin, minh, lan, huy];

      // Mutual contacts
      for (const u1 of allDemoUsers) {
        for (const u2 of allDemoUsers) {
          if (u1.id !== u2.id) {
            await this.usersService.addContact(u1.id, u2.id);
          }
        }
      }

      // Direct conversation: Minh <-> Lan
      const directConv = await this.conversationsService.openDirect(
        minh.id,
        lan.id,
      );

      const dMsg1 = await this.messagesService.sendMessage(minh.id, {
        conversationId: directConv.id,
        kind: MessageKind.TEXT,
        text: 'Chào Lan! Mình vừa dựng xong hệ thống Docker cho đồ án Zalo OTT.',
      });
      await this.messagesService.sendMessage(lan.id, {
        conversationId: directConv.id,
        kind: MessageKind.TEXT,
        text: 'Tuyệt vời quá Minh ơi, để mình vào nhóm kiểm tra thử tính năng gửi tài liệu và biểu cảm nhé!',
        replyToId: dMsg1.id,
      });
      await this.messagesService.reactToMessage(lan.id, dMsg1.id, '❤️');

      // Group conversation: Nhóm Đồ Án KTPM
      const groupConv = await this.conversationsService.createGroup(
        minh.id,
        'Nhóm Đồ Án KTPM — Zalo OTT',
        [lan.id, huy.id, admin.id],
      );
      await this.conversationsService.setGroupAdmin(
        minh.id,
        groupConv.id,
        lan.id,
        true,
      );

      const gMsg1 = await this.messagesService.sendMessage(minh.id, {
        conversationId: groupConv.id,
        kind: MessageKind.TEXT,
        text: 'Chào cả nhóm! Đây là kênh thảo luận chính thức của dự án sa_zalo_ott_service.',
      });

      await this.messagesService.sendMessage(huy.id, {
        conversationId: groupConv.id,
        kind: MessageKind.EMOTION,
        stickerCode: 'zalo-cheer',
        text: '🎉',
      });

      // Create a real sample document attachment on disk
      const docContent = Buffer.from(
        [
          'TÀI LIỆU KIẾN TRÚC HỆ THỐNG — SA ZALO OTT SERVICE',
          '===================================================',
          '1. Backend: NestJS 12 + GraphQL + Socket.IO + MongoDB 7',
          '2. Frontend: React 19 + Material UI (Zalo-inspired theme)',
          '3. Hỗ trợ 5 loại tin nhắn: Text, Image, Video, Document, Emotion',
          '4. Module thống kê hoạt động người dùng (DAU/MAU, lưu lượng media, nhóm sôi nổi)',
        ].join('\n'),
        'utf8',
      );
      const storedDoc = await this.storageService.saveConversationFile(
        lan.id,
        groupConv.id,
        {
          fieldname: 'file',
          originalname: 'Kien_truc_he_thong_Zalo_OTT.txt',
          mimetype: 'text/plain',
          size: docContent.byteLength,
          buffer: docContent,
        },
      );

      const gDocMsg = await this.messagesService.sendMessage(lan.id, {
        conversationId: groupConv.id,
        kind: MessageKind.DOCUMENT,
        text: 'Mình gửi tài liệu tóm tắt kiến trúc hệ thống cho buổi demo nhé!',
        attachments: [
          {
            storageKey: storedDoc.storageKey,
            originalName: storedDoc.originalName,
            mimeType: storedDoc.mimeType,
          },
        ],
      });

      await this.messagesService.reactToMessage(minh.id, gDocMsg.id, '👍');
      await this.messagesService.reactToMessage(huy.id, gDocMsg.id, '🎉');
      await this.messagesService.reactToMessage(admin.id, gMsg1.id, '❤️');

      // Historical multi-day activity events across past 6 days for rich Analytics charts
      const now = Date.now();
      for (let daysAgo = 6; daysAgo >= 1; daysAgo--) {
        const ts = new Date(now - daysAgo * 86_400_000);
        const dayUsers = allDemoUsers.slice(0, (daysAgo % 3) + 2);
        for (const u of dayUsers) {
          await this.activitiesService.record({
            actorId: u.id,
            type: ActivityEventType.LOGIN_SUCCEEDED,
            metadata: { method: 'password' },
            occurredAt: ts,
          });
        }
        await this.activitiesService.record({
          actorId: minh.id,
          type: ActivityEventType.ACCOUNT_CREATED,
          metadata: { seeded: true },
          occurredAt: daysAgo === 6 ? ts : new Date(now - 5 * 86_400_000),
        });
      }

      this.logger.log(
        'Demo seed completed: admin@chatter.vn / Admin@123456 & 3 user accounts.',
      );
    } catch (error) {
      this.logger.warn(
        `Demo seed skipped or encountered error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
