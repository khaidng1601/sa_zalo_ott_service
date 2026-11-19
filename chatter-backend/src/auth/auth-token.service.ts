import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';

interface TokenClaims {
  sub: string;
  iat: number;
  exp: number;
  iss: 'sa-zalo-ott-service';
}

@Injectable()
export class AuthTokenService {
  private readonly expiresInSeconds = 8 * 60 * 60;

  constructor(private readonly configService: ConfigService) {}

  assertConfigured(): void {
    this.getSecret();
  }

  issue(userId: string): { accessToken: string; expiresIn: number } {
    const now = Math.floor(Date.now() / 1000);
    const header = this.encode({ alg: 'HS256', typ: 'JWT' });
    const payload = this.encode({
      sub: userId,
      iat: now,
      exp: now + this.expiresInSeconds,
      iss: 'sa-zalo-ott-service',
    } satisfies TokenClaims);
    const unsignedToken = `${header}.${payload}`;
    const signature = this.sign(unsignedToken);

    return {
      accessToken: `${unsignedToken}.${signature}`,
      expiresIn: this.expiresInSeconds,
    };
  }

  verify(token: string): TokenClaims {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid token');
    }

    const [headerPart, payloadPart, signaturePart] = parts;
    // Compare the encoded text, not decoded bytes: base64url decoding ignores the
    // last character's spare bits, so several spellings decode to the same bytes.
    const expectedSignature = Buffer.from(
      this.sign(`${headerPart}.${payloadPart}`),
    );
    const providedSignature = Buffer.from(signaturePart);

    if (
      expectedSignature.length !== providedSignature.length ||
      !timingSafeEqual(expectedSignature, providedSignature)
    ) {
      throw new Error('Invalid token');
    }

    const header = this.decode(headerPart);
    const payload = this.decode(payloadPart) as Partial<TokenClaims>;
    const now = Math.floor(Date.now() / 1000);

    if (
      header.alg !== 'HS256' ||
      header.typ !== 'JWT' ||
      typeof payload.sub !== 'string' ||
      !/^[a-f\d]{24}$/i.test(payload.sub) ||
      typeof payload.iat !== 'number' ||
      typeof payload.exp !== 'number' ||
      payload.exp <= now ||
      payload.iat > now ||
      payload.iss !== 'sa-zalo-ott-service'
    ) {
      throw new Error('Invalid token');
    }

    return payload as TokenClaims;
  }

  private sign(value: string): string {
    return createHmac('sha256', this.getSecret())
      .update(value)
      .digest('base64url');
  }

  private getSecret(): string {
    const secret = this.configService.get<string>('AUTH_JWT_SECRET');
    if (!secret || Buffer.byteLength(secret, 'utf8') < 32) {
      throw new InternalServerErrorException(
        'AUTH_JWT_SECRET must be configured with at least 32 characters.',
      );
    }
    return secret;
  }

  private encode(value: object): string {
    return Buffer.from(JSON.stringify(value)).toString('base64url');
  }

  private decode(value: string): Record<string, unknown> {
    return JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    ) as Record<string, unknown>;
  }
}
