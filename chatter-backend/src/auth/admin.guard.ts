import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { UserRole } from '../users/entities/user.entity.js';
import type { AuthenticatedRequest } from './auth.guard.js';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request: AuthenticatedRequest | undefined =
      context.getType() === 'http'
        ? context.switchToHttp().getRequest<AuthenticatedRequest>()
        : GqlExecutionContext.create(context).getContext<{
            req: AuthenticatedRequest;
          }>()?.req;

    if (!request?.user) {
      throw new UnauthorizedException('Authentication is required.');
    }

    if (request.user.role !== UserRole.ADMIN) {
      throw new ForbiddenException(
        'System administrator privileges are required.',
      );
    }

    return true;
  }
}
