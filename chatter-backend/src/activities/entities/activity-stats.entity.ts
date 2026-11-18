import { Field, Float, ID, Int, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class MessageKindCount {
  @Field()
  kind: string;

  @Field(() => Int)
  count: number;
}

@ObjectType()
export class MediaUsageByKind {
  @Field()
  kind: string;

  @Field(() => Int)
  count: number;

  @Field(() => Float)
  totalBytes: number;
}

@ObjectType()
export class DailyActivityPoint {
  @Field()
  date: string;

  @Field(() => Int)
  activeUsers: number;

  @Field(() => Int)
  newAccounts: number;

  @Field(() => Int)
  messagesSent: number;

  @Field(() => Int)
  filesUploaded: number;

  @Field(() => Int)
  reactionsAdded: number;
}

@ObjectType()
export class ActiveGroupStat {
  @Field(() => ID)
  conversationId: string;

  @Field()
  title: string;

  @Field(() => Int)
  memberCount: number;

  @Field(() => Int)
  messageCount: number;
}

@ObjectType()
export class ActivityStats {
  @Field()
  from: Date;

  @Field()
  to: Date;

  @Field(() => Int)
  totalAccounts: number;

  @Field(() => Int)
  activeAccountsTotal: number;

  @Field(() => Int)
  disabledAccountsTotal: number;

  @Field(() => Int)
  dau: number;

  @Field(() => Int)
  mau: number;

  @Field(() => Int)
  activeUsersInRange: number;

  @Field(() => Int)
  newAccountsInRange: number;

  @Field(() => Int)
  totalGroups: number;

  @Field(() => Int)
  newGroupsInRange: number;

  @Field(() => Int)
  activeGroupsInRange: number;

  @Field(() => Int)
  totalMessagesInRange: number;

  @Field(() => Int)
  recalledMessagesInRange: number;

  @Field(() => Int)
  reactionsInRange: number;

  @Field(() => Int)
  groupMembersAddedInRange: number;

  @Field(() => Int)
  groupMembersRemovedInRange: number;

  @Field(() => Float)
  totalStorageBytes: number;

  @Field(() => [MessageKindCount])
  messagesByKind: MessageKindCount[];

  @Field(() => [MediaUsageByKind])
  mediaUsageByKind: MediaUsageByKind[];

  @Field(() => [DailyActivityPoint])
  dailySeries: DailyActivityPoint[];

  @Field(() => [ActiveGroupStat])
  topActiveGroups: ActiveGroupStat[];
}

@ObjectType()
export class MyActivitySummary {
  @Field(() => Int)
  days: number;

  @Field(() => Int)
  messagesSent: number;

  @Field(() => Int)
  reactionsAdded: number;

  @Field(() => Int)
  filesUploaded: number;

  @Field(() => Float)
  totalUploadedBytes: number;

  @Field(() => Int)
  groupsJoined: number;

  @Field(() => Int)
  directChatsCount: number;

  @Field(() => [MessageKindCount])
  messagesByKind: MessageKindCount[];
}
