import { UseGuards } from '@nestjs/common';
import {
  Args,
  Context,
  Int,
  Mutation,
  Parent,
  Query,
  ResolveField,
  Resolver,
} from '@nestjs/graphql';
import { AdminGuard } from '../auth/admin.guard.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { User, UserRole } from '../users/entities/user.entity.js';
import { CreateGroupInput } from './dto/create-group.input.js';
import {
  Conversation,
  ConversationMember,
  ConversationType,
} from './entities/conversation.entity.js';
import { ConversationsService } from './conversations.service.js';

interface ConversationGraphQLContext {
  req: { user?: User };
}

@Resolver(() => Conversation)
@UseGuards(AuthGuard)
export class ConversationsResolver {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Query(() => [Conversation])
  myConversations(
    @Context() context: ConversationGraphQLContext,
  ): Promise<Conversation[]> {
    return this.conversationsService.listForUser(this.currentUser(context).id);
  }

  @ResolveField(() => [ConversationMember])
  members(
    @Parent() conversation: Conversation,
    @Context() context: ConversationGraphQLContext,
  ): Promise<ConversationMember[]> {
    const user = this.currentUser(context);
    return this.conversationsService.listMembers(
      user.id,
      conversation.id,
      user.role === UserRole.ADMIN,
    );
  }

  @Query(() => [ConversationMember])
  conversationMembers(
    @Context() context: ConversationGraphQLContext,
    @Args('conversationId') conversationId: string,
  ): Promise<ConversationMember[]> {
    const user = this.currentUser(context);
    return this.conversationsService.listMembers(
      user.id,
      conversationId,
      user.role === UserRole.ADMIN,
    );
  }

  @Mutation(() => Conversation)
  openDirectConversation(
    @Context() context: ConversationGraphQLContext,
    @Args('userId') userId: string,
  ): Promise<Conversation> {
    return this.conversationsService.openDirect(
      this.currentUser(context).id,
      userId,
    );
  }

  @Mutation(() => Conversation)
  createGroup(
    @Context() context: ConversationGraphQLContext,
    @Args('input') input: CreateGroupInput,
  ): Promise<Conversation> {
    return this.conversationsService.createGroup(
      this.currentUser(context).id,
      input.title,
      input.memberIds,
    );
  }

  @Mutation(() => Conversation)
  updateGroupTitle(
    @Context() context: ConversationGraphQLContext,
    @Args('conversationId') conversationId: string,
    @Args('title') title: string,
  ): Promise<Conversation> {
    return this.conversationsService.updateGroupTitle(
      this.currentUser(context).id,
      conversationId,
      title,
    );
  }

  @Mutation(() => ConversationMember)
  addGroupMember(
    @Context() context: ConversationGraphQLContext,
    @Args('conversationId') conversationId: string,
    @Args('userId') userId: string,
  ): Promise<ConversationMember> {
    return this.conversationsService.addMember(
      this.currentUser(context).id,
      conversationId,
      userId,
    );
  }

  @Mutation(() => ConversationMember)
  removeGroupMember(
    @Context() context: ConversationGraphQLContext,
    @Args('conversationId') conversationId: string,
    @Args('userId') userId: string,
  ): Promise<ConversationMember> {
    return this.conversationsService.removeMember(
      this.currentUser(context).id,
      conversationId,
      userId,
    );
  }

  @Mutation(() => ConversationMember)
  setGroupAdmin(
    @Context() context: ConversationGraphQLContext,
    @Args('conversationId') conversationId: string,
    @Args('userId') userId: string,
    @Args('isAdmin') isAdmin: boolean,
  ): Promise<ConversationMember> {
    return this.conversationsService.setGroupAdmin(
      this.currentUser(context).id,
      conversationId,
      userId,
      isAdmin,
    );
  }

  @Mutation(() => ConversationMember)
  transferGroupOwnership(
    @Context() context: ConversationGraphQLContext,
    @Args('conversationId') conversationId: string,
    @Args('newOwnerId') newOwnerId: string,
  ): Promise<ConversationMember> {
    return this.conversationsService.transferGroupOwnership(
      this.currentUser(context).id,
      conversationId,
      newOwnerId,
    );
  }

  @Mutation(() => ConversationMember)
  leaveGroup(
    @Context() context: ConversationGraphQLContext,
    @Args('conversationId') conversationId: string,
  ): Promise<ConversationMember> {
    return this.conversationsService.leaveGroup(
      this.currentUser(context).id,
      conversationId,
    );
  }

  @Mutation(() => Boolean)
  markConversationRead(
    @Context() context: ConversationGraphQLContext,
    @Args('conversationId') conversationId: string,
  ): Promise<boolean> {
    return this.conversationsService.markConversationRead(
      this.currentUser(context).id,
      conversationId,
    );
  }

  @UseGuards(AuthGuard, AdminGuard)
  @Query(() => [Conversation])
  adminConversations(
    @Args('search', { nullable: true }) search?: string,
    @Args('type', { type: () => ConversationType, nullable: true })
    type?: ConversationType,
    @Args('includeClosed', { nullable: true, defaultValue: true })
    includeClosed?: boolean,
    @Args('limit', { type: () => Int, nullable: true, defaultValue: 50 })
    limit?: number,
  ): Promise<Conversation[]> {
    return this.conversationsService.adminListConversations({
      search,
      type,
      includeClosed: includeClosed ?? true,
      limit: limit ?? 50,
    });
  }

  @UseGuards(AuthGuard, AdminGuard)
  @Mutation(() => Conversation)
  adminSetConversationClosed(
    @Args('conversationId') conversationId: string,
    @Args('closed') closed: boolean,
  ): Promise<Conversation> {
    return this.conversationsService.adminSetConversationClosed(
      conversationId,
      closed,
    );
  }

  private currentUser(context: ConversationGraphQLContext): User {
    if (!context.req.user) {
      throw new Error('Authenticated user was not populated.');
    }
    return context.req.user;
  }
}
