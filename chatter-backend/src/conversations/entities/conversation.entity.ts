import { Field, ID, Int, ObjectType, registerEnumType } from '@nestjs/graphql';

export enum ConversationType {
  DIRECT = 'direct',
  GROUP = 'group',
}

export enum ConversationRole {
  OWNER = 'owner',
  ADMIN = 'admin',
  MEMBER = 'member',
}

export enum MembershipStatus {
  ACTIVE = 'active',
  LEFT = 'left',
  REMOVED = 'removed',
}

registerEnumType(ConversationType, { name: 'ConversationType' });
registerEnumType(ConversationRole, { name: 'ConversationRole' });
registerEnumType(MembershipStatus, { name: 'MembershipStatus' });

@ObjectType()
export class Conversation {
  @Field(() => ID)
  id: string;

  @Field(() => ConversationType)
  type: ConversationType;

  @Field({ nullable: true })
  title?: string;

  @Field(() => ID)
  createdBy: string;

  @Field({ nullable: true })
  lastMessageAt?: Date;

  @Field({ nullable: true })
  lastMessagePreview?: string;

  @Field({ nullable: true })
  closedAt?: Date;

  @Field(() => Int, { nullable: true })
  memberCount?: number;

  @Field()
  createdAt: Date;

  @Field(() => [ConversationMember])
  members?: ConversationMember[];
}

@ObjectType()
export class ConversationMember {
  @Field(() => ID)
  id: string;

  @Field(() => ID)
  conversationId: string;

  @Field(() => ID)
  userId: string;

  @Field({ nullable: true })
  displayName?: string;

  @Field({ nullable: true })
  email?: string;

  @Field({ nullable: true })
  avatarUrl?: string;

  @Field({ nullable: true })
  isOnline?: boolean;

  @Field(() => ConversationRole)
  role: ConversationRole;

  @Field(() => MembershipStatus)
  status: MembershipStatus;

  @Field()
  joinedAt: Date;

  @Field({ nullable: true })
  leftAt?: Date;

  @Field({ nullable: true })
  lastReadAt?: Date;
}
