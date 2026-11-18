import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ActivitiesService } from '../activities/activities.service.js';
import { ActivityEventType } from '../activities/schemas/user-activity.schema.js';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';
import { UsersService } from '../users/users.service.js';
import {
  Conversation,
  ConversationMember,
  ConversationRole,
  ConversationType,
  MembershipStatus,
} from './entities/conversation.entity.js';
import {
  ConversationMemberDocument,
  ConversationMemberRecord,
} from './schemas/conversation-member.schema.js';
import {
  ConversationDocument,
  ConversationRecord,
} from './schemas/conversation.schema.js';

const isValidId = (id: string) => /^[a-f\d]{24}$/i.test(id);
const escapeRegex = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

@Injectable()
export class ConversationsService {
  constructor(
    @InjectModel(ConversationRecord.name)
    private readonly conversationModel: Model<ConversationRecord>,
    @InjectModel(ConversationMemberRecord.name)
    private readonly memberModel: Model<ConversationMemberRecord>,
    private readonly usersService: UsersService,
    @Optional()
    private readonly activitiesService?: ActivitiesService,
    @Optional()
    private readonly realtimeGateway?: RealtimeGateway,
  ) {}

  async openDirect(
    requesterId: string,
    otherUserId: string,
  ): Promise<Conversation> {
    this.assertValidId(otherUserId);
    if (requesterId === otherUserId) {
      throw new BadRequestException(
        'You cannot start a direct chat with yourself.',
      );
    }
    await this.assertActiveUser(otherUserId);

    const directKey = [requesterId, otherUserId].sort().join(':');
    const existing = await this.conversationModel.findOne({ directKey }).exec();
    if (existing) {
      if (existing.closedAt) {
        throw new ForbiddenException('This conversation has been closed by an administrator.');
      }
      return this.toConversation(existing);
    }

    let conversation: ConversationDocument;
    try {
      conversation = await new this.conversationModel({
        type: ConversationType.DIRECT,
        createdBy: requesterId,
        directKey,
      }).save();
    } catch (error) {
      if (this.isDuplicateKey(error)) {
        const racedConversation = await this.conversationModel
          .findOne({ directKey })
          .exec();
        if (racedConversation) return this.toConversation(racedConversation);
      }
      throw error;
    }

    try {
      await this.memberModel.insertMany([
        this.newMember(conversation.id, requesterId, ConversationRole.MEMBER),
        this.newMember(conversation.id, otherUserId, ConversationRole.MEMBER),
      ]);
      const result = this.toConversation(conversation);
      await this.activitiesService?.record({
        actorId: requesterId,
        type: ActivityEventType.CONVERSATION_CREATED,
        conversationId: conversation.id,
        targetUserId: otherUserId,
        metadata: { conversationType: ConversationType.DIRECT, memberCount: 2 },
      });
      this.realtimeGateway?.emitToUsers(
        [requesterId, otherUserId],
        'conversation.updated',
        { conversationId: conversation.id },
      );
      return result;
    } catch (error) {
      try {
        await this.memberModel.deleteMany({ conversationId: conversation.id });
        await this.conversationModel.deleteOne({ _id: conversation.id });
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          'Failed to create direct chat and clean up its partial records.',
        );
      }
      throw error;
    }
  }

  async createGroup(
    requesterId: string,
    titleInput: string,
    memberIdsInput: string[],
  ): Promise<Conversation> {
    const title = titleInput.trim();
    if (title.length === 0 || title.length > 80) {
      throw new BadRequestException(
        'Group title must contain between 1 and 80 characters.',
      );
    }

    const memberIds = [...new Set([requesterId, ...memberIdsInput])];
    if (memberIdsInput.length > 99 || memberIds.length > 100) {
      throw new BadRequestException('A group can contain at most 100 members.');
    }
    for (const memberId of memberIds) {
      this.assertValidId(memberId);
      await this.assertActiveUser(memberId);
    }

    const conversation = await new this.conversationModel({
      type: ConversationType.GROUP,
      title,
      createdBy: requesterId,
    }).save();

    try {
      await this.memberModel.insertMany(
        memberIds.map((userId) =>
          this.newMember(
            conversation.id,
            userId,
            userId === requesterId
              ? ConversationRole.OWNER
              : ConversationRole.MEMBER,
          ),
        ),
      );
      const result = this.toConversation(conversation);
      await this.activitiesService?.record({
        actorId: requesterId,
        type: ActivityEventType.CONVERSATION_CREATED,
        conversationId: conversation.id,
        metadata: {
          conversationType: ConversationType.GROUP,
          memberCount: memberIds.length,
        },
      });
      this.realtimeGateway?.emitToUsers(memberIds, 'conversation.updated', {
        conversationId: conversation.id,
      });
      return result;
    } catch (error) {
      try {
        await this.memberModel.deleteMany({ conversationId: conversation.id });
        await this.conversationModel.deleteOne({ _id: conversation.id });
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          'Failed to create group and clean up its partial records.',
        );
      }
      throw error;
    }
  }

  async updateGroupTitle(
    requesterId: string,
    conversationId: string,
    titleInput: string,
  ): Promise<Conversation> {
    const title = titleInput.trim();
    if (title.length === 0 || title.length > 80) {
      throw new BadRequestException(
        'Group title must contain between 1 and 80 characters.',
      );
    }
    const conversation = await this.requireGroup(conversationId);
    await this.requireManager(requesterId, conversationId);
    conversation.title = title;
    const saved = await conversation.save();
    await this.notifyConversationMembers(conversationId);
    return this.toConversation(saved);
  }

  async listForUser(userId: string): Promise<Conversation[]> {
    const memberships = await this.memberModel
      .find({ userId, status: MembershipStatus.ACTIVE })
      .select('conversationId')
      .exec();
    const conversations = await this.conversationModel
      .find({
        _id: {
          $in: memberships.map((membership) => membership.conversationId),
        },
        closedAt: null,
      })
      .sort({ lastMessageAt: -1, createdAt: -1 })
      .exec();
    return conversations.map((conversation) =>
      this.toConversation(conversation),
    );
  }

  async listMembers(
    requesterId: string,
    conversationId: string,
    allowSystemAdmin = false,
  ): Promise<ConversationMember[]> {
    if (!allowSystemAdmin) {
      await this.requireActiveMembership(requesterId, conversationId);
    }
    const members = await this.memberModel
      .find({ conversationId, status: MembershipStatus.ACTIVE })
      .sort({ joinedAt: 1 })
      .exec();

    const userMap = await this.usersService.findByIds(
      members.map((m) => m.userId),
    );

    return Promise.all(
      members.map(async (member) => {
        const user =
          userMap.get(member.userId) ??
          (await this.usersService.findActiveById(member.userId));
        return this.toMember(member, {
          displayName: user?.displayName ?? 'Tài khoản không còn hoạt động',
          email: user?.email,
          avatarUrl: user?.avatarUrl,
          isOnline: this.realtimeGateway?.isUserOnline(member.userId) ?? false,
        });
      }),
    );
  }

  async addMember(
    requesterId: string,
    conversationId: string,
    userId: string,
  ): Promise<ConversationMember> {
    this.assertValidId(userId);
    const conversation = await this.requireGroup(conversationId);
    await this.requireManager(requesterId, conversationId);
    await this.assertActiveUser(userId);

    const activeCount = await this.memberModel
      .countDocuments({ conversationId, status: MembershipStatus.ACTIVE })
      .exec();
    if (activeCount >= 100) {
      throw new BadRequestException('A group can contain at most 100 members.');
    }

    const existing = await this.memberModel
      .findOne({ conversationId, userId })
      .exec();
    if (existing?.status === MembershipStatus.ACTIVE) {
      throw new ConflictException('This user is already a group member.');
    }

    let savedMember: ConversationMemberDocument;
    if (existing) {
      existing.status = MembershipStatus.ACTIVE;
      existing.role = ConversationRole.MEMBER;
      existing.joinedAt = new Date();
      existing.leftAt = undefined;
      savedMember = await existing.save();
    } else {
      savedMember = await new this.memberModel(
        this.newMember(conversation.id, userId, ConversationRole.MEMBER),
      ).save();
    }

    await this.activitiesService?.record({
      actorId: requesterId,
      type: ActivityEventType.GROUP_MEMBER_ADDED,
      conversationId,
      targetUserId: userId,
    });
    await this.notifyConversationMembers(conversationId, [userId]);

    const user = await this.usersService.findActiveById(userId);
    return this.toMember(savedMember, {
      displayName: user?.displayName,
      email: user?.email,
      avatarUrl: user?.avatarUrl,
    });
  }

  async removeMember(
    requesterId: string,
    conversationId: string,
    userId: string,
  ): Promise<ConversationMember> {
    this.assertValidId(userId);
    await this.requireGroup(conversationId);
    const requester = await this.requireManager(requesterId, conversationId);
    if (requesterId === userId) {
      throw new BadRequestException('Use leaveGroup to leave the group.');
    }

    const member = await this.requireActiveMembership(userId, conversationId);
    if (member.role === ConversationRole.OWNER) {
      throw new ForbiddenException('The group owner cannot be removed.');
    }
    if (
      member.role === ConversationRole.ADMIN &&
      requester.role !== ConversationRole.OWNER
    ) {
      throw new ForbiddenException('Only the owner can remove a group admin.');
    }

    member.status = MembershipStatus.REMOVED;
    member.leftAt = new Date();
    await member.save();

    await this.activitiesService?.record({
      actorId: requesterId,
      type: ActivityEventType.GROUP_MEMBER_REMOVED,
      conversationId,
      targetUserId: userId,
    });
    await this.notifyConversationMembers(conversationId, [userId]);

    return this.toMember(member);
  }

  async setGroupAdmin(
    requesterId: string,
    conversationId: string,
    userId: string,
    isAdmin: boolean,
  ): Promise<ConversationMember> {
    this.assertValidId(userId);
    await this.requireGroup(conversationId);
    const requester = await this.requireActiveMembership(
      requesterId,
      conversationId,
    );
    if (requester.role !== ConversationRole.OWNER) {
      throw new ForbiddenException(
        'Only the group owner can change admin roles.',
      );
    }

    const member = await this.requireActiveMembership(userId, conversationId);
    if (member.role === ConversationRole.OWNER) {
      throw new BadRequestException('The group owner role cannot be changed.');
    }
    member.role = isAdmin ? ConversationRole.ADMIN : ConversationRole.MEMBER;
    await member.save();
    await this.notifyConversationMembers(conversationId);
    return this.toMember(member);
  }

  async transferGroupOwnership(
    requesterId: string,
    conversationId: string,
    newOwnerId: string,
  ): Promise<ConversationMember> {
    this.assertValidId(newOwnerId);
    if (requesterId === newOwnerId) {
      throw new BadRequestException('You are already the group owner.');
    }

    await this.requireGroup(conversationId);
    const currentOwner = await this.requireActiveMembership(
      requesterId,
      conversationId,
    );
    if (currentOwner.role !== ConversationRole.OWNER) {
      throw new ForbiddenException(
        'Only the current group owner can transfer ownership.',
      );
    }

    const targetMember = await this.requireActiveMembership(
      newOwnerId,
      conversationId,
    );
    await this.assertActiveUser(newOwnerId);

    currentOwner.role = ConversationRole.ADMIN;
    targetMember.role = ConversationRole.OWNER;

    await currentOwner.save();
    await targetMember.save();
    await this.notifyConversationMembers(conversationId);

    const targetUser = await this.usersService.findActiveById(newOwnerId);
    return this.toMember(targetMember, {
      displayName: targetUser?.displayName,
      email: targetUser?.email,
      avatarUrl: targetUser?.avatarUrl,
    });
  }

  async leaveGroup(
    requesterId: string,
    conversationId: string,
  ): Promise<ConversationMember> {
    await this.requireGroup(conversationId);
    const member = await this.requireActiveMembership(
      requesterId,
      conversationId,
    );
    if (member.role === ConversationRole.OWNER) {
      throw new ForbiddenException(
        'Transfer group ownership before leaving the group.',
      );
    }
    member.status = MembershipStatus.LEFT;
    member.leftAt = new Date();
    await member.save();

    await this.activitiesService?.record({
      actorId: requesterId,
      type: ActivityEventType.GROUP_MEMBER_REMOVED,
      conversationId,
      targetUserId: requesterId,
      metadata: { selfLeft: true },
    });
    await this.notifyConversationMembers(conversationId, [requesterId]);

    return this.toMember(member);
  }

  async markConversationRead(
    userId: string,
    conversationId: string,
  ): Promise<boolean> {
    const member = await this.requireActiveMembership(userId, conversationId);
    const now = new Date();
    member.lastReadAt = now;
    await member.save();

    if (this.realtimeGateway) {
      const memberIds = await this.getActiveMemberIds(conversationId);
      this.realtimeGateway.emitToUsers(memberIds, 'conversation.read', {
        conversationId,
        userId,
        lastReadAt: now.toISOString(),
      });
    }
    return true;
  }

  async assertOpenConversationMembership(
    userId: string,
    conversationId: string,
  ): Promise<{
    conversation: ConversationDocument;
    member: ConversationMemberDocument;
  }> {
    this.assertValidId(conversationId);
    const conversation = await this.conversationModel
      .findOne({ _id: conversationId, closedAt: null })
      .exec();
    if (!conversation) {
      throw new NotFoundException('Conversation not found or closed.');
    }
    const member = await this.requireActiveMembership(userId, conversationId);
    return { conversation, member };
  }

  async getActiveMemberIds(conversationId: string): Promise<string[]> {
    const members = await this.memberModel
      .find({ conversationId, status: MembershipStatus.ACTIVE })
      .select('userId')
      .exec();
    return members.map((m) => m.userId);
  }

  async touchLastMessage(
    conversationId: string,
    senderId: string,
    timestamp: Date,
    previewText: string,
  ): Promise<void> {
    await Promise.all([
      this.conversationModel
        .updateOne(
          { _id: conversationId },
          {
            lastMessageAt: timestamp,
            lastMessagePreview: previewText.slice(0, 200),
          },
        )
        .exec(),
      this.memberModel
        .updateOne(
          { conversationId, userId: senderId },
          { lastReadAt: timestamp },
        )
        .exec(),
    ]);
  }

  async adminListConversations(filter: {
    search?: string;
    type?: ConversationType;
    includeClosed?: boolean;
    limit?: number;
  }): Promise<Conversation[]> {
    const limit = Math.min(Math.max(Math.trunc(filter.limit || 50), 1), 200);
    const query: Record<string, unknown> = {};
    if (filter.type) query.type = filter.type;
    if (filter.includeClosed === false) query.closedAt = null;
    if (filter.search?.trim()) {
      query.title = new RegExp(escapeRegex(filter.search.trim()), 'i');
    }

    const conversations = await this.conversationModel
      .find(query)
      .sort({ lastMessageAt: -1, createdAt: -1 })
      .limit(limit)
      .exec();

    return Promise.all(
      conversations.map(async (conv) => {
        const memberCount = await this.memberModel
          .countDocuments({
            conversationId: conv.id,
            status: MembershipStatus.ACTIVE,
          })
          .exec();
        return this.toConversation(conv, memberCount);
      }),
    );
  }

  async adminSetConversationClosed(
    conversationId: string,
    closed: boolean,
  ): Promise<Conversation> {
    this.assertValidId(conversationId);
    const conversation = await this.conversationModel
      .findById(conversationId)
      .exec();
    if (!conversation) {
      throw new NotFoundException('Conversation not found.');
    }
    conversation.closedAt = closed ? new Date() : undefined;
    const saved = await conversation.save();
    await this.notifyConversationMembers(conversationId);
    const memberCount = await this.memberModel
      .countDocuments({
        conversationId: saved.id,
        status: MembershipStatus.ACTIVE,
      })
      .exec();
    return this.toConversation(saved, memberCount);
  }

  private async notifyConversationMembers(
    conversationId: string,
    extraUserIds: string[] = [],
  ): Promise<void> {
    if (!this.realtimeGateway) return;
    const activeIds = await this.getActiveMemberIds(conversationId);
    this.realtimeGateway.emitToUsers(
      [...activeIds, ...extraUserIds],
      'conversation.updated',
      { conversationId },
    );
  }

  private async requireGroup(id: string): Promise<ConversationDocument> {
    this.assertValidId(id);
    const conversation = await this.conversationModel
      .findOne({ _id: id, type: ConversationType.GROUP, closedAt: null })
      .exec();
    if (!conversation) throw new NotFoundException('Group not found.');
    return conversation;
  }

  private async requireManager(
    userId: string,
    conversationId: string,
  ): Promise<ConversationMemberDocument> {
    const member = await this.requireActiveMembership(userId, conversationId);
    if (
      member.role !== ConversationRole.OWNER &&
      member.role !== ConversationRole.ADMIN
    ) {
      throw new ForbiddenException('Only group owners and admins can do this.');
    }
    return member;
  }

  private async requireActiveMembership(
    userId: string,
    conversationId: string,
  ): Promise<ConversationMemberDocument> {
    this.assertValidId(conversationId);
    const member = await this.memberModel
      .findOne({
        conversationId,
        userId,
        status: MembershipStatus.ACTIVE,
      })
      .exec();
    if (!member) {
      throw new ForbiddenException('You are not an active conversation member.');
    }
    return member;
  }

  private async assertActiveUser(userId: string): Promise<void> {
    const user = await this.usersService.findActiveById(userId);
    if (!user) throw new NotFoundException('Active user not found.');
  }

  private assertValidId(id: string): void {
    if (!isValidId(id)) throw new BadRequestException('Invalid ID.');
  }

  private newMember(
    conversationId: string,
    userId: string,
    role: ConversationRole,
  ) {
    return {
      conversationId,
      userId,
      role,
      status: MembershipStatus.ACTIVE,
      joinedAt: new Date(),
    };
  }

  private isDuplicateKey(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 11000
    );
  }

  private toConversation(
    conversation: {
      id: string;
      type: ConversationType;
      title?: string | null;
      createdBy: string;
      lastMessageAt?: Date | null;
      lastMessagePreview?: string | null;
      closedAt?: Date | null;
      createdAt: Date;
    },
    memberCount?: number,
  ): Conversation {
    return {
      id: conversation.id,
      type: conversation.type,
      title: conversation.title ?? undefined,
      createdBy: conversation.createdBy,
      lastMessageAt: conversation.lastMessageAt ?? undefined,
      lastMessagePreview: conversation.lastMessagePreview ?? undefined,
      closedAt: conversation.closedAt ?? undefined,
      ...(memberCount !== undefined ? { memberCount } : {}),
      createdAt: conversation.createdAt,
    };
  }

  private toMember(
    member: {
      id: string;
      conversationId: string;
      userId: string;
      role: ConversationRole;
      status: MembershipStatus;
      joinedAt: Date;
      leftAt?: Date | null;
      lastReadAt?: Date | null;
    },
    profile?: {
      displayName?: string;
      email?: string;
      avatarUrl?: string;
      isOnline?: boolean;
    },
  ): ConversationMember {
    return {
      id: member.id,
      conversationId: member.conversationId,
      userId: member.userId,
      ...(profile?.displayName ? { displayName: profile.displayName } : {}),
      ...(profile?.email ? { email: profile.email } : {}),
      ...(profile?.avatarUrl ? { avatarUrl: profile.avatarUrl } : {}),
      ...(profile?.isOnline !== undefined ? { isOnline: profile.isOnline } : {}),
      role: member.role,
      status: member.status,
      joinedAt: member.joinedAt,
      leftAt: member.leftAt ?? undefined,
      lastReadAt: member.lastReadAt ?? undefined,
    };
  }
}
