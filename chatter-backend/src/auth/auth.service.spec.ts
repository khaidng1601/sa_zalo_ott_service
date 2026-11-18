import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service.js';

describe('AuthService', () => {
  const user = {
    id: '507f1f77bcf86cd799439011',
    email: 'user@example.com',
    displayName: 'Example User',
    status: 'active',
    role: 'user',
  };
  const usersService = {
    createAccount: vi.fn(),
    authenticate: vi.fn(),
    findActiveById: vi.fn(),
  };
  const authTokenService = {
    assertConfigured: vi.fn(),
    issue: vi.fn(() => ({ accessToken: 'signed-token', expiresIn: 28800 })),
  };
  let service: AuthService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AuthService(usersService as never, authTokenService as never);
  });

  it('registers an account and returns an access token', async () => {
    usersService.createAccount.mockResolvedValue(user);

    await expect(
      service.register({
        email: user.email,
        password: 'secure-password',
        displayName: user.displayName,
      }),
    ).resolves.toMatchObject({
      accessToken: 'signed-token',
      expiresIn: 28800,
      user,
    });
    expect(authTokenService.assertConfigured).toHaveBeenCalledOnce();
    expect(authTokenService.issue).toHaveBeenCalledWith(user.id);
  });

  it('returns the active user for a valid subject', async () => {
    usersService.findActiveById.mockResolvedValue(user);
    await expect(service.getAuthenticatedUser(user.id)).resolves.toBe(user);
  });

  it('rejects a missing or disabled user for a valid token subject', async () => {
    usersService.findActiveById.mockResolvedValue(null);
    await expect(service.getAuthenticatedUser(user.id)).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
