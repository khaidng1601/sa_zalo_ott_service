import { InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthTokenService } from './auth-token.service.js';

describe('AuthTokenService', () => {
  const userId = '507f1f77bcf86cd799439011';
  const secret = 'a'.repeat(64);
  let service: AuthTokenService;

  beforeEach(() => {
    service = new AuthTokenService(
      new ConfigService({ AUTH_JWT_SECRET: secret }),
    );
  });

  it('issues and verifies signed tokens with an expiration', () => {
    const issued = service.issue(userId);
    const claims = service.verify(issued.accessToken);

    expect(claims.sub).toBe(userId);
    expect(claims.exp - claims.iat).toBe(issued.expiresIn);
  });

  it('rejects tampered tokens', () => {
    const issued = service.issue(userId);
    const tampered = `${issued.accessToken.slice(0, -1)}x`;

    expect(() => service.verify(tampered)).toThrow('Invalid token');
  });

  it('requires a strong configured secret', () => {
    const serviceWithoutSecret = new AuthTokenService(
      new ConfigService({ AUTH_JWT_SECRET: 'too-short' }),
    );

    expect(() => serviceWithoutSecret.issue(userId)).toThrow(
      InternalServerErrorException,
    );
  });
});
