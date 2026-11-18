import {
  Args,
  Context,
  Int,
  Mutation,
  Query,
  Resolver,
} from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { CreateUserInput } from '../users/dto/create-user.input.js';
import { UpdateProfileInput } from '../users/dto/update-profile.input.js';
import { User, UserRole, UserStatus } from '../users/entities/user.entity.js';
import { UserDirectoryEntry } from '../users/entities/user-directory-entry.entity.js';
import { UsersService } from '../users/users.service.js';
import { AdminGuard } from './admin.guard.js';
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
    return this.currentUser(context);
  }

  @UseGuards(AuthGuard)
  @Mutation(() => User)
  updateMyProfile(
    @Context() context: AuthGraphQLContext,
    @Args('input') input: UpdateProfileInput,
  ): Promise<User> {
    return this.usersService.updateProfile(this.currentUser(context).id, input);
  }

  @UseGuards(AuthGuard)
  @Mutation(() => Boolean)
  changeMyPassword(
    @Context() context: AuthGraphQLContext,
    @Args('currentPassword') currentPassword: string,
    @Args('newPassword') newPassword: string,
  ): Promise<boolean> {
    return this.usersService.changePassword(
      this.currentUser(context).id,
      currentPassword,
      newPassword,
    );
  }

  @UseGuards(AuthGuard)
  @Query(() => UserDirectoryEntry, { nullable: true })
  async userByEmail(
    @Args('email') email: string,
  ): Promise<UserDirectoryEntry | null> {
    const user = await this.usersService.findActiveByEmail(email);
    return user
      ? {
          id: user.id,
          displayName: user.displayName,
          email: user.email,
          avatarUrl: user.avatarUrl,
          lastSeenAt: user.lastSeenAt,
        }
      : null;
  }

  @UseGuards(AuthGuard)
  @Query(() => [UserDirectoryEntry])
  searchUsers(
    @Context() context: AuthGraphQLContext,
    @Args('query', { nullable: true }) query?: string,
    @Args('limit', { type: () => Int, nullable: true, defaultValue: 25 })
    limit?: number,
  ): Promise<UserDirectoryEntry[]> {
    return this.usersService.searchDirectory(
      this.currentUser(context).id,
      query,
      limit ?? 25,
    );
  }

  @UseGuards(AuthGuard)
  @Query(() => [UserDirectoryEntry])
  myContacts(@Context() context: AuthGraphQLContext): Promise<UserDirectoryEntry[]> {
    return this.usersService.listContacts(this.currentUser(context).id);
  }

  @UseGuards(AuthGuard)
  @Mutation(() => UserDirectoryEntry)
  addContact(
    @Context() context: AuthGraphQLContext,
    @Args('userId') userId: string,
  ): Promise<UserDirectoryEntry> {
    return this.usersService.addContact(this.currentUser(context).id, userId);
  }

  @UseGuards(AuthGuard)
  @Mutation(() => Boolean)
  removeContact(
    @Context() context: AuthGraphQLContext,
    @Args('userId') userId: string,
  ): Promise<boolean> {
    return this.usersService.removeContact(this.currentUser(context).id, userId);
  }

  @UseGuards(AuthGuard, AdminGuard)
  @Query(() => [User])
  adminUsers(
    @Args('search', { nullable: true }) search?: string,
    @Args('status', { type: () => UserStatus, nullable: true })
    status?: UserStatus,
    @Args('limit', { type: () => Int, nullable: true, defaultValue: 50 })
    limit?: number,
  ): Promise<User[]> {
    return this.usersService.adminListUsers({ search, status, limit });
  }

  @UseGuards(AuthGuard, AdminGuard)
  @Mutation(() => User)
  adminSetUserStatus(
    @Context() context: AuthGraphQLContext,
    @Args('userId') userId: string,
    @Args('status', { type: () => UserStatus }) status: UserStatus,
  ): Promise<User> {
    return this.usersService.adminSetUserStatus(
      this.currentUser(context).id,
      userId,
      status,
    );
  }

  @UseGuards(AuthGuard, AdminGuard)
  @Mutation(() => User)
  adminSetUserRole(
    @Context() context: AuthGraphQLContext,
    @Args('userId') userId: string,
    @Args('role', { type: () => UserRole }) role: UserRole,
  ): Promise<User> {
    return this.usersService.adminSetUserRole(
      this.currentUser(context).id,
      userId,
      role,
    );
  }

  private currentUser(context: AuthGraphQLContext): User {
    if (!context.req.user) {
      throw new Error('Authenticated user was not populated.');
    }
    return context.req.user;
  }
}
