import { Args, Context, Mutation, Query, Resolver } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { CreateUserInput } from '../users/dto/create-user.input.js';
import { User } from '../users/entities/user.entity.js';
import { UserDirectoryEntry } from '../users/entities/user-directory-entry.entity.js';
import { UsersService } from '../users/users.service.js';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { AuthPayload } from './entities/auth-payload.entity.js';

interface AuthGraphQLContext {
  req: { user?: User };
}

@Resolver()
export class AuthResolver {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
  ) {}

  @Mutation(() => AuthPayload)
  register(
    @Args('createUserInput') createUserInput: CreateUserInput,
  ): Promise<AuthPayload> {
    return this.authService.register(createUserInput);
  }

  @Mutation(() => AuthPayload)
  login(
    @Args('email') email: string,
    @Args('password') password: string,
  ): Promise<AuthPayload> {
    return this.authService.login(email, password);
  }

  @UseGuards(AuthGuard)
  @Query(() => User)
  me(@Context() context: AuthGraphQLContext): User {
    if (!context.req.user) {
      throw new Error('Authenticated user was not populated.');
    }
    return context.req.user;
  }

  @UseGuards(AuthGuard)
  @Query(() => UserDirectoryEntry, { nullable: true })
  async userByEmail(
    @Args('email') email: string,
  ): Promise<UserDirectoryEntry | null> {
    const user = await this.usersService.findActiveByEmail(email);
    return user ? { id: user.id, displayName: user.displayName } : null;
  }
}
