import { UseGuards } from '@nestjs/common';
import { Args, Context, Int, Query, Resolver } from '@nestjs/graphql';
import { AuthGuard } from '../auth/auth.guard.js';
import { User } from '../users/entities/user.entity.js';
import { CallHistoryEntry } from './entities/call-history.entity.js';
import { CallsService } from './calls.service.js';

interface CallsGraphQLContext {
  req: { user?: User };
}

@Resolver(() => CallHistoryEntry)
@UseGuards(AuthGuard)
export class CallsResolver {
  constructor(private readonly callsService: CallsService) {}

  @Query(() => [CallHistoryEntry])
  callHistory(
    @Context() context: CallsGraphQLContext,
    @Args('conversationId') conversationId: string,
    @Args('limit', { type: () => Int, nullable: true, defaultValue: 50 })
    limit?: number,
  ): Promise<CallHistoryEntry[]> {
    if (!context.req.user) {
      throw new Error('Authenticated user was not populated.');
    }

    return this.callsService.listCallHistory(
      context.req.user.id,
      conversationId,
      limit ?? 50,
    );
  }
}
