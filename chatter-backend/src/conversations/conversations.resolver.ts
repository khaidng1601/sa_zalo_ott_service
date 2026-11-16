import { UseGuards } from '@nestjs/common';
import {
  Args,
  Context,
  Mutation,
  Parent,
  Query,
  ResolveField,
  Resolver,
} from '@nestjs/graphql';
import { User } from '../users/entities/user.entity.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { CreateGroupInput } from './dto/create-group.input.js';
import {
  Conversation,
  ConversationMember,
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
    return this.conversationsService.listMembers(
      this.currentUser(context).id,
      conversation.id,
    );
  }

  @Query(() => [ConversationMember])
  conversationMembers(
    @Context() context: ConversationGraphQLContext,
    @Args('conversationId') conversationId: string,
  ): Promise<ConversationMember[]> {
    return this.conversationsService.listMembers(
      this.currentUser(context).id,
      conversationId,
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
  leaveGroup(
    @Context() context: ConversationGraphQLContext,
    @Args('conversationId') conversationId: string,
  ): Promise<ConversationMember> {
    return this.conversationsService.leaveGroup(
      this.currentUser(context).id,
      conversationId,
    );
  }

  private currentUser(context: ConversationGraphQLContext): User {
    if (!context.req.user) {
      throw new Error('Authenticated user was not populated.');
    }
    return context.req.user;
  }
}
