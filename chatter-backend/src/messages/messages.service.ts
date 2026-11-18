import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ActivitiesService } from '../activities/activities.service.js';
import { ActivityEventType } from '../activities/schemas/user-activity.schema.js';
import { ConversationsService } from '../conversations/conversations.service.js';
import { ConversationRole } from '../conversations/entities/conversation.entity.js';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';
import { StorageService } from '../storage/storage.service.js';
import { User } from '../users/entities/user.entity.js';
import { UsersService } from '../users/users.service.js';
import { SendMessageInput } from './dto/send-message.input.js';
import {
  Message,
  MessageKind,
  MessagePage,
  ReplyMessagePreview,
} from './entities/message.entity.js';
import {
  AttachmentSubdoc,
  MessageDocument,
  MessageRecord,
} from './schemas/message.schema.js';

const isValidObjectId = (id: string) => /^[a-f\d]{24}$/i.test(id);

export const ALLOWED_REACTIONS = new Set([
  '👍',
  '❤️',
  '😂',
  '😮',
  '😢',
  '😡',
  '🎉',
  '🙏',
]);

@Injectable()
export class MessagesService {
  constructor(
    @InjectModel(MessageRecord.name)
    private readonly messageModel: Model<MessageRecord>,
    private readonly conversationsService: ConversationsService,
    private readonly usersService: UsersService,
    private readonly storageService: StorageService,
    @Optional()
    private readonly activitiesService?: ActivitiesService,
    @Optional()
    private readonly realtimeGateway?: RealtimeGateway,
  ) {}

  async listMessages(
    requesterId: string,
    conversationId: string,
    beforeCursor?: string,
    limitInput = 30,
  ): Promise<MessagePage> {
    await this.conversationsService.assertOpenConversationMembership(
      requesterId,
      conversationId,
    );

    const limit = Math.min(Math.max(Math.trunc(limitInput || 30), 1), 50);
    const filter: Record<string, unknown> = { conversationId };

    if (beforeCursor?.trim()) {
      const [isoPart, idPart] = beforeCursor.split('::');
      const cursorDate = new Date(isoPart);
      if (Number.isNaN(cursorDate.getTime())) {
        throw new BadRequestException('Invalid pagination cursor.');
      }
      if (idPart && isValidObjectId(idPart)) {
        filter.$or = [
          { createdAt: { $lt: cursorDate } },
          { createdAt: cursorDate, _id: { $lt: idPart } },
        ];
      } else {
        filter.createdAt = { $lt: cursorDate };
      }
    }

    const docs = await this.messageModel
      .find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1)
      .exec();

    const hasMore = docs.length > limit;
    const slice = hasMore ? docs.slice(0, limit) : docs;
    // Reverse to chronological ascending order for chat UI display
    const ordered = [...slice].reverse();

    const messages = await this.hydrateMessages(ordered);
    const oldest = ordered[0];
    const nextCursor =
      hasMore && oldest
        ? `${oldest.createdAt.toISOString()}::${oldest.id}`
        : undefined;

    return {
      items: messages,
      hasMore,
      nextCursor,
    };
  }

  async sendMessage(
    senderId: string,
    input: SendMessageInput,
  ): Promise<Message> {
    await this.conversationsService.assertOpenConversationMembership(
      senderId,
      input.conversationId,
    );

    const trimmedText = input.text?.trim() ?? '';
    const trimmedSticker = input.stickerCode?.trim() ?? '';
    const rawAttachments = input.attachments ?? [];

    if (trimmedText.length > 4000) {
      throw new BadRequestException(
        'Message text cannot exceed 4,000 characters.',
      );
    }

    if (input.replyToId) {
      if (!isValidObjectId(input.replyToId)) {
        throw new BadRequestException('Invalid replyToId.');
      }
      const targetReply = await this.messageModel
        .findOne({ _id: input.replyToId, conversationId: input.conversationId })
        .exec();
      if (!targetReply) {
        throw new NotFoundException(
          'Replied message does not exist in this conversation.',
        );
      }
    }

    const verifiedAttachments: AttachmentSubdoc[] = [];

    switch (input.kind) {
      case MessageKind.TEXT: {
        if (trimmedText.length === 0) {
          throw new BadRequestException('Text message cannot be empty.');
        }
        if (rawAttachments.length > 0) {
          throw new BadRequestException(
            'Text messages cannot include file attachments.',
          );
        }
        break;
      }

      case MessageKind.EMOTION: {
        if (!trimmedSticker && trimmedText.length === 0) {
          throw new BadRequestException(
            'Emotion message requires a stickerCode or emoji.',
          );
        }
        if (trimmedSticker.length > 64 || trimmedText.length > 32) {
          throw new BadRequestException('Invalid emotion payload.');
        }
        if (rawAttachments.length > 0) {
          throw new BadRequestException(
            'Emotion messages cannot include file attachments.',
          );
        }
        break;
      }

      case MessageKind.IMAGE:
      case MessageKind.VIDEO:
      case MessageKind.DOCUMENT: {
        const maxFiles = input.kind === MessageKind.VIDEO ? 1 : 5;
        if (rawAttachments.length === 0 || rawAttachments.length > maxFiles) {
          throw new BadRequestException(
            `${input.kind} message requires between 1 and ${maxFiles} attachment(s).`,
          );
        }

        for (const att of rawAttachments) {
          const stored = await this.storageService.verifyStoredAttachment(
            input.conversationId,
            att.storageKey,
          );
          const classified = this.storageService.classifyFile(
            att.originalName,
            att.mimeType,
            stored.sizeBytes,
          );
          if (classified.kind !== input.kind) {
            throw new BadRequestException(
              `Attachment "${att.originalName}" is classified as "${classified.kind}", which does not match message kind "${input.kind}".`,
            );
          }
          verifiedAttachments.push({
            storageKey: att.storageKey,
            originalName: att.originalName.trim().slice(0, 180),
            mimeType: classified.mimeType,
            sizeBytes: stored.sizeBytes,
            uploadedAt: new Date(),
          });
        }
        break;
      }

      default:
        throw new BadRequestException(
          `Unsupported user message kind "${input.kind}".`,
        );
    }

    const saved = await new this.messageModel({
      conversationId: input.conversationId,
      senderId,
      kind: input.kind,
      text: trimmedText || null,
      stickerCode: trimmedSticker || null,
      attachments: verifiedAttachments,
      reactions: [],
      replyToId: input.replyToId ?? null,
    }).save();

    const preview = this.buildPreviewText(
      input.kind,
      trimmedText,
      verifiedAttachments[0]?.originalName,
    );

    await Promise.all([
      this.conversationsService.touchLastMessage(
        input.conversationId,
        senderId,
        saved.createdAt,
        preview,
      ),
      this.usersService.touchLastSeen(senderId),
      this.activitiesService?.record({
        actorId: senderId,
        type: ActivityEventType.MESSAGE_SENT,
        conversationId: input.conversationId,
        metadata: {
          kind: input.kind,
          attachmentCount: verifiedAttachments.length,
        },
        occurredAt: saved.createdAt,
      }),
    ]);

    const [hydrated] = await this.hydrateMessages([saved]);

    if (this.realtimeGateway) {
      const memberIds = await this.conversationsService.getActiveMemberIds(
        input.conversationId,
      );
      this.realtimeGateway.emitToUsers(memberIds, 'message.created', hydrated);
      this.realtimeGateway.emitToUsers(memberIds, 'conversation.updated', {
        conversationId: input.conversationId,
        lastMessageAt: saved.createdAt.toISOString(),
        lastMessagePreview: preview,
      });
    }

    return hydrated;
  }

  async reactToMessage(
    requesterId: string,
    messageId: string,
    emojiInput: string,
  ): Promise<Message> {
    if (!isValidObjectId(messageId)) {
      throw new BadRequestException('Invalid message ID.');
    }
    const emoji = emojiInput.trim();
    if (!ALLOWED_REACTIONS.has(emoji)) {
      throw new BadRequestException('Unsupported reaction emoji.');
    }

    const message = await this.messageModel.findById(messageId).exec();
    if (!message) {
      throw new NotFoundException('Message not found.');
    }
    if (message.deletedAt) {
      throw new BadRequestException('Cannot react to a recalled message.');
    }

    await this.conversationsService.assertOpenConversationMembership(
      requesterId,
      message.conversationId,
    );

    const existingIdx = message.reactions.findIndex(
      (r) => r.userId === requesterId,
    );
    if (existingIdx >= 0) {
      message.reactions[existingIdx].emoji = emoji;
      message.reactions[existingIdx].createdAt = new Date();
    } else {
      message.reactions.push({
        userId: requesterId,
        emoji,
        createdAt: new Date(),
      });
    }

    const saved = await message.save();

    await this.activitiesService?.record({
      actorId: requesterId,
      type: ActivityEventType.MESSAGE_REACTION_ADDED,
      conversationId: message.conversationId,
      metadata: { emoji },
    });

    const [hydrated] = await this.hydrateMessages([saved]);

    if (this.realtimeGateway) {
      const memberIds = await this.conversationsService.getActiveMemberIds(
        message.conversationId,
      );
      this.realtimeGateway.emitToUsers(memberIds, 'message.updated', hydrated);
    }

    return hydrated;
  }

  async removeReaction(requesterId: string, messageId: string): Promise<Message> {
    if (!isValidObjectId(messageId)) {
      throw new BadRequestException('Invalid message ID.');
    }
    const message = await this.messageModel.findById(messageId).exec();
    if (!message) {
      throw new NotFoundException('Message not found.');
    }

    await this.conversationsService.assertOpenConversationMembership(
      requesterId,
      message.conversationId,
    );

    message.reactions = message.reactions.filter(
      (r) => r.userId !== requesterId,
    );
    const saved = await message.save();
    const [hydrated] = await this.hydrateMessages([saved]);

    if (this.realtimeGateway) {
      const memberIds = await this.conversationsService.getActiveMemberIds(
        message.conversationId,
      );
      this.realtimeGateway.emitToUsers(memberIds, 'message.updated', hydrated);
    }

    return hydrated;
  }

  async deleteMessage(requesterId: string, messageId: string): Promise<Message> {
    if (!isValidObjectId(messageId)) {
      throw new BadRequestException('Invalid message ID.');
    }
    const message = await this.messageModel.findById(messageId).exec();
    if (!message) {
      throw new NotFoundException('Message not found.');
    }

    const { member } =
      await this.conversationsService.assertOpenConversationMembership(
        requesterId,
        message.conversationId,
      );

    const canRecall =
      message.senderId === requesterId ||
      member.role === ConversationRole.OWNER ||
      member.role === ConversationRole.ADMIN;

    if (!canRecall) {
      throw new ForbiddenException(
        'You can only recall your own messages unless you are a group manager.',
      );
    }

    if (!message.deletedAt) {
      message.deletedAt = new Date();
      message.deletedBy = requesterId;
      await message.save();

      await this.activitiesService?.record({
        actorId: requesterId,
        type: ActivityEventType.MESSAGE_DELETED,
        conversationId: message.conversationId,
        metadata: { kind: message.kind },
      });
    }

    const [hydrated] = await this.hydrateMessages([message]);

    if (this.realtimeGateway) {
      const memberIds = await this.conversationsService.getActiveMemberIds(
        message.conversationId,
      );
      this.realtimeGateway.emitToUsers(memberIds, 'message.deleted', hydrated);
    }

    return hydrated;
  }

  private buildPreviewText(
    kind: MessageKind,
    text: string,
    fileName?: string,
  ): string {
    switch (kind) {
      case MessageKind.IMAGE:
        return text ? `[Hình ảnh] ${text}` : '[Hình ảnh]';
      case MessageKind.VIDEO:
        return text ? `[Video] ${text}` : '[Video]';
      case MessageKind.DOCUMENT:
        return fileName ? `[Tài liệu] ${fileName}` : '[Tài liệu]';
      case MessageKind.EMOTION:
        return '[Biểu cảm]';
      default:
        return text;
    }
  }

  private async hydrateMessages(docs: MessageDocument[]): Promise<Message[]> {
    if (docs.length === 0) return [];

    const replyIds = docs
      .map((d) => d.replyToId)
      .filter((id): id is string => Boolean(id && isValidObjectId(id)));

    const replyDocs =
      replyIds.length > 0
        ? await this.messageModel.find({ _id: { $in: replyIds } }).exec()
        : [];
    const replyMap = new Map(replyDocs.map((r) => [r.id, r]));

    const userIds = new Set<string>();
    for (const d of docs) {
      userIds.add(d.senderId);
      for (const r of d.reactions) userIds.add(r.userId);
    }
    for (const rd of replyDocs) {
      userIds.add(rd.senderId);
    }

    const userMap: Map<string, User> = await this.usersService.findByIds(
      Array.from(userIds),
    );

    return docs.map((doc) => {
      const isDeleted = Boolean(doc.deletedAt);
      const sender = userMap.get(doc.senderId);

      let replyTo: ReplyMessagePreview | undefined;
      if (doc.replyToId) {
        const replyDoc = replyMap.get(doc.replyToId);
        if (replyDoc) {
          const replyDeleted = Boolean(replyDoc.deletedAt);
          replyTo = {
            id: replyDoc.id,
            senderId: replyDoc.senderId,
            senderDisplayName:
              userMap.get(replyDoc.senderId)?.displayName ?? 'Người dùng',
            kind: replyDoc.kind,
            text: replyDeleted ? undefined : (replyDoc.text ?? undefined),
            stickerCode: replyDeleted
              ? undefined
              : (replyDoc.stickerCode ?? undefined),
            isDeleted: replyDeleted,
          };
        }
      }

      return {
        id: doc.id,
        conversationId: doc.conversationId,
        senderId: doc.senderId,
        senderDisplayName: sender?.displayName ?? 'Người dùng',
        senderAvatarUrl: sender?.avatarUrl,
        kind: doc.kind,
        text: isDeleted ? undefined : (doc.text ?? undefined),
        stickerCode: isDeleted ? undefined : (doc.stickerCode ?? undefined),
        attachments: isDeleted
          ? []
          : doc.attachments.map((att) => ({
              storageKey: att.storageKey,
              originalName: att.originalName,
              mimeType: att.mimeType,
              sizeBytes: att.sizeBytes,
              uploadedAt: att.uploadedAt,
              url: this.storageService.signDownloadUrl(att.storageKey),
            })),
        reactions: isDeleted
          ? []
          : doc.reactions.map((r) => ({
              userId: r.userId,
              displayName: userMap.get(r.userId)?.displayName ?? 'Người dùng',
              emoji: r.emoji,
              createdAt: r.createdAt,
            })),
        replyToId: doc.replyToId ?? undefined,
        replyTo,
        isDeleted,
        deletedAt: doc.deletedAt ?? undefined,
        deletedBy: doc.deletedBy ?? undefined,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    });
  }
}
