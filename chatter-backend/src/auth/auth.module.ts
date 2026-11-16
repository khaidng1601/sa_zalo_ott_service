import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module.js';
import { AuthGuard } from './auth.guard.js';
import { AuthResolver } from './auth.resolver.js';
import { AuthService } from './auth.service.js';
import { AuthTokenService } from './auth-token.service.js';

@Module({
  imports: [UsersModule],
  providers: [AuthResolver, AuthService, AuthTokenService, AuthGuard],
  exports: [AuthGuard, AuthService, AuthTokenService],
})
export class AuthModule {}
