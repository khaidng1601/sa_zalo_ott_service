import {
  CanActivate,
  ExecutionContext,
  InternalServerErrorException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { AuthService } from './auth.service.js';
import { AuthTokenService } from './auth-token.service.js';
import { User } from '../users/entities/user.entity.js';

export interface AuthenticatedRequest {
  headers?: { authorization?: string };
  user?: User;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly authTokenService: AuthTokenService,
    private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request: AuthenticatedRequest | undefined =
      context.getType() === 'http'
        ? context.switchToHttp().getRequest<AuthenticatedRequest>()
        : GqlExecutionContext.create(context).getContext<{
            req: AuthenticatedRequest;
          }>()?.req;

    const authorization = request?.headers?.authorization;
    const match =
      typeof authorization === 'string'
        ? /^Bearer ([^\s]+)$/.exec(authorization)
        : null;

    if (!match || !request) {
      throw new UnauthorizedException('Authentication is required.');
    }

    let claims;
    try {
      claims = this.authTokenService.verify(match[1]);
    } catch (error) {
      if (error instanceof InternalServerErrorException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid or expired access token.');
    }

    request.user = await this.authService.getAuthenticatedUser(claims.sub);
    return true;
  }
}
