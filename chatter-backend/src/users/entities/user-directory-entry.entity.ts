import { Field, ID, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class UserDirectoryEntry {
  @Field(() => ID)
  id: string;

  @Field()
  displayName: string;

  @Field({ nullable: true })
  email?: string;

  @Field({ nullable: true })
  avatarUrl?: string;

  @Field({ nullable: true })
  lastSeenAt?: Date;

  @Field({ nullable: true })
  isContact?: boolean;
}
