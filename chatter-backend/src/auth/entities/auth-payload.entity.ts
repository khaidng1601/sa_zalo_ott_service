import { Field, Int, ObjectType } from '@nestjs/graphql';
import { User } from '../../users/entities/user.entity.js';

@ObjectType()
export class AuthPayload {
  @Field()
  accessToken: string;

  @Field(() => Int)
  expiresIn: number;

  @Field(() => User)
  user: User;
}
