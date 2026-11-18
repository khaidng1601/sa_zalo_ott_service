import { UseGuards } from '@nestjs/common';
import { Args, Context, Int, Query, Resolver } from '@nestjs/graphql';
import { AuthGuard } from '../auth/auth.guard.js';
import { AdminGuard } from '../auth/admin.guard.js';
import { User } from '../users/entities/user.entity.js';
import { ActivitiesService } from './activities.service.js';
import {
  ActivityStats,
  MyActivitySummary,
} from './entities/activity-stats.entity.js';

interface ActivityContext {
  req: { user?: User };
}

@Resolver()
export class ActivitiesResolver {
  constructor(private readonly activitiesService: ActivitiesService) {}

  @UseGuards(AuthGuard, AdminGuard)
  @Query(() => ActivityStats)
  activityStats(
    @Args('days', { type: () => Int, nullable: true, defaultValue: 7 })
    days?: number,
    @Args('from', { type: () => Date, nullable: true })
    from?: Date,
    @Args('to', { type: () => Date, nullable: true })
    to?: Date,
  ): Promise<ActivityStats> {
    return this.activitiesService.getSystemStats(days ?? 7, from, to);
  }

  @UseGuards(AuthGuard)
  @Query(() => MyActivitySummary)
  myActivitySummary(
    @Context() context: ActivityContext,
    @Args('days', { type: () => Int, nullable: true, defaultValue: 7 })
    days?: number,
  ): Promise<MyActivitySummary> {
    const user = context.req.user;
    if (!user) throw new Error('Authenticated user was not populated.');
    return this.activitiesService.getMyActivitySummary(user.id, days ?? 7);
  }
}
