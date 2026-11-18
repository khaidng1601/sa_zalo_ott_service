import { Field, InputType } from '@nestjs/graphql';

@InputType()
export class CreateGroupInput {
  @Field()
  title: string;

  @Field(() => [String])
  memberIds: string[];
}
