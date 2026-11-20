import {
  Field,
  GraphQLISODateTime,
  Int,
  ObjectType,
} from '@nestjs/graphql';

@ObjectType()
export class CallHistoryEntry {
  @Field()
  callId: string;

  @Field()
  conversationId: string;

  @Field()
  callerId: string;

  @Field()
  calleeId: string;

  @Field()
  mode: string;

  @Field()
  outcome: string;

  @Field()
  startedAt: Date;

  @Field(() => GraphQLISODateTime, { nullable: true })
  connectedAt?: Date | null;

  @Field()
  endedAt: Date;

  @Field(() => Int)
  durationSeconds: number;
}
