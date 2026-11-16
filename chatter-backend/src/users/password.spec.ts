import { hashPassword, verifyPassword } from './password.js';

describe('password hashing', () => {
  it('verifies a password against its salted hash', async () => {
    const passwordHash = await hashPassword('secure-password');

    await expect(
      verifyPassword('secure-password', passwordHash),
    ).resolves.toBe(true);
    await expect(
      verifyPassword('wrong-password', passwordHash),
    ).resolves.toBe(false);
  });

  it('rejects malformed or unsupported hashes', async () => {
    await expect(verifyPassword('password', 'not-a-hash')).resolves.toBe(false);
    await expect(
      verifyPassword('password', `bcrypt$${'a'.repeat(32)}$${'b'.repeat(128)}`),
    ).resolves.toBe(false);
  });
});
