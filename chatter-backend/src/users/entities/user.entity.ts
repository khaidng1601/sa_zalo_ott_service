import { Field, ID, ObjectType, registerEnumType } from '@nestjs/graphql';

export enum UserStatus {
  ACTIVE = 'active',
  DISABLED = 'disabled',
}

export enum UserRole {
  USER = 'user',
  ADMIN = 'admin',
}

registerEnumType(UserStatus, { name: 'UserStatus' });
registerEnumType(UserRole, { name: 'UserRole' });

@ObjectType()
export class User {
  @Field(() => ID)
  id: string;

  @Field()
  email: string;

  @Field()
  displayName: string;

  @Field({ nullable: true })
  avatarUrl?: string;

  @Field(() => UserStatus)
  status: UserStatus;

  @Field(() => UserRole)
  role: UserRole;

  @Field()
  createdAt: Date;

  @Field()
  updatedAt: Date;
}
