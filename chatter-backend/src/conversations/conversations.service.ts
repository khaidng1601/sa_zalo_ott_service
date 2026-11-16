import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UsersService } from '../users/users.service.js';
import {
  Conversation,
  ConversationRole,
  ConversationType,
  MembershipStatus,
  ConversationMember,
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

@Injectable()
export class ConversationsService {
  constructor(
    @InjectModel(ConversationRecord.name)
    private readonly conversationModel: Model<ConversationRecord>,
    @InjectModel(ConversationMemberRecord.name)
    private readonly memberModel: Model<ConversationMemberRecord>,
    private readonly usersService: UsersService,
  ) {}

  async openDirect(
    requesterId: string,
    otherUserId: string,
  ): Promise<Conversation> {
    this.assertValidId(otherUserId);
    if (requesterId === otherUserId) {
      throw new BadRequestException('You cannot start a direct chat with yourself.');
    }
    await this.assertActiveUser(otherUserId);

    const directKey = [requesterId, otherUserId].sort().join(':');
    const existing = await this.conversationModel.findOne({ directKey }).exec();
    if (existing) return this.toConversation(existing);

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
      return this.toConversation(conversation);
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
      return this.toConversation(conversation);
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

  async listForUser(userId: string): Promise<Conversation[]> {
    const memberships = await this.memberModel
      .find({ userId, status: MembershipStatus.ACTIVE })
      .select('conversationId')
      .exec();
    const conversations = await this.conversationModel
      .find({
        _id: { $in: memberships.map((membership) => membership.conversationId) },
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
  ): Promise<ConversationMember[]> {
    await this.requireActiveMembership(requesterId, conversationId);
    const members = await this.memberModel
      .find({ conversationId, status: MembershipStatus.ACTIVE })
      .sort({ joinedAt: 1 })
      .exec();
    return Promise.all(
      members.map(async (member) => {
        const user = await this.usersService.findActiveById(member.userId);
        return this.toMember(member, user?.displayName ?? 'Tài khoản không còn hoạt động');
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

    const existing = await this.memberModel
      .findOne({ conversationId, userId })
      .exec();
    if (existing?.status === MembershipStatus.ACTIVE) {
      throw new ConflictException('This user is already a group member.');
    }

    if (existing) {
      existing.status = MembershipStatus.ACTIVE;
      existing.role = ConversationRole.MEMBER;
      existing.joinedAt = new Date();
      existing.leftAt = undefined;
      return this.toMember(await existing.save());
    }

    const member = await new this.memberModel(
      this.newMember(conversation.id, userId, ConversationRole.MEMBER),
    ).save();
    return this.toMember(member);
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
      throw new ForbiddenException('Only the group owner can change admin roles.');
    }

    const member = await this.requireActiveMembership(userId, conversationId);
    if (member.role === ConversationRole.OWNER) {
      throw new BadRequestException('The group owner role cannot be changed.');
    }
    member.role = isAdmin ? ConversationRole.ADMIN : ConversationRole.MEMBER;
    await member.save();
    return this.toMember(member);
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
    return this.toMember(member);
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

  private toConversation(conversation: {
    id: string;
    type: ConversationType;
    title?: string | null;
    createdBy: string;
    lastMessageAt?: Date | null;
    createdAt: Date;
  }): Conversation {
    return {
      id: conversation.id,
      type: conversation.type,
      title: conversation.title ?? undefined,
      createdBy: conversation.createdBy,
      lastMessageAt: conversation.lastMessageAt ?? undefined,
      createdAt: conversation.createdAt,
    };
  }

  private toMember(member: {
    id: string;
    conversationId: string;
    userId: string;
    role: ConversationRole;
    status: MembershipStatus;
    joinedAt: Date;
    leftAt?: Date | null;
  }, displayName?: string): ConversationMember {
    return {
      id: member.id,
      conversationId: member.conversationId,
      userId: member.userId,
      ...(displayName ? { displayName } : {}),
      role: member.role,
      status: member.status,
      joinedAt: member.joinedAt,
      leftAt: member.leftAt ?? undefined,
    };
  }
}
