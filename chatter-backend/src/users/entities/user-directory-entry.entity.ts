import { Field, ID, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class UserDirectoryEntry {
  @Field(() => ID)
  id: string;

  @Field()
  displayName: string;
}
