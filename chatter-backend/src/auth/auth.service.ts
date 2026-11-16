import { Injectable, UnauthorizedException } from '@nestjs/common';
import { CreateUserInput } from '../users/dto/create-user.input.js';
import { User } from '../users/entities/user.entity.js';
import { UsersService } from '../users/users.service.js';
import { AuthPayload } from './entities/auth-payload.entity.js';
import { AuthTokenService } from './auth-token.service.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly authTokenService: AuthTokenService,
  ) {}

  async register(input: CreateUserInput): Promise<AuthPayload> {
    this.authTokenService.assertConfigured();
    const user = await this.usersService.createAccount(input);
    return this.createPayload(user);
  }

  async login(email: string, password: string): Promise<AuthPayload> {
    this.authTokenService.assertConfigured();
    const user = await this.usersService.authenticate(email, password);
    return this.createPayload(user);
  }

  async getAuthenticatedUser(userId: string): Promise<User> {
    const user = await this.usersService.findActiveById(userId);
    if (!user) {
      throw new UnauthorizedException('Authentication is required.');
    }
    return user;
  }

  private createPayload(user: User): AuthPayload {
    return {
      ...this.authTokenService.issue(user.id),
      user,
    };
  }
}
