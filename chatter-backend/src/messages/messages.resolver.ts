import { UseGuards } from '@nestjs/common';
import { Args, Context, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { AuthGuard } from '../auth/auth.guard.js';
import { User } from '../users/entities/user.entity.js';
import { SendMessageInput } from './dto/send-message.input.js';
import { Message, MessagePage } from './entities/message.entity.js';
import { MessagesService } from './messages.service.js';

interface MessageGraphQLContext {
  req: { user?: User };
}

@Resolver(() => Message)
@UseGuards(AuthGuard)
export class MessagesResolver {
  constructor(private readonly messagesService: MessagesService) {}

  @Query(() => MessagePage)
  messages(
    @Context() context: MessageGraphQLContext,
    @Args('conversationId') conversationId: string,
    @Args('before', { nullable: true }) before?: string,
    @Args('limit', { type: () => Int, nullable: true, defaultValue: 30 })
    limit?: number,
  ): Promise<MessagePage> {
    return this.messagesService.listMessages(
      this.currentUser(context).id,
      conversationId,
      before,
      limit ?? 30,
    );
  }

  @Mutation(() => Message)
  sendMessage(
    @Context() context: MessageGraphQLContext,
    @Args('input') input: SendMessageInput,
  ): Promise<Message> {
    return this.messagesService.sendMessage(
      this.currentUser(context).id,
      input,
    );
  }

  @Mutation(() => Message)
  reactToMessage(
    @Context() context: MessageGraphQLContext,
    @Args('messageId') messageId: string,
    @Args('emoji') emoji: string,
  ): Promise<Message> {
    return this.messagesService.reactToMessage(
      this.currentUser(context).id,
      messageId,
      emoji,
    );
  }

  @Mutation(() => Message)
  removeMessageReaction(
    @Context() context: MessageGraphQLContext,
    @Args('messageId') messageId: string,
  ): Promise<Message> {
    return this.messagesService.removeReaction(
      this.currentUser(context).id,
      messageId,
    );
  }

  @Mutation(() => Message)
  deleteMessage(
    @Context() context: MessageGraphQLContext,
    @Args('messageId') messageId: string,
  ): Promise<Message> {
    return this.messagesService.deleteMessage(
      this.currentUser(context).id,
      messageId,
    );
  }

  private currentUser(context: MessageGraphQLContext): User {
    if (!context.req.user) {
      throw new Error('Authenticated user was not populated.');
    }
    return context.req.user;
  }
}
