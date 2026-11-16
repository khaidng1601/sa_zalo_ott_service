import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'node:crypto';

const PASSWORD_HASH_BYTES = 64;

const derivePasswordHash = (password: string, salt: string): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    scryptCallback(password, salt, PASSWORD_HASH_BYTES, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(derivedKey);
    });
  });

export const hashPassword = async (password: string): Promise<string> => {
  const salt = randomBytes(16).toString('hex');
  const derivedKey = await derivePasswordHash(password, salt);
  return `scrypt$${salt}$${derivedKey.toString('hex')}`;
};

export const verifyPassword = async (
  password: string,
  passwordHash: string,
): Promise<boolean> => {
  const [algorithm, salt, storedHash, ...extraParts] = passwordHash.split('$');
  if (
    algorithm !== 'scrypt' ||
    !salt ||
    !storedHash ||
    extraParts.length > 0 ||
    !/^[a-f0-9]{32}$/.test(salt) ||
    !/^[a-f0-9]{128}$/.test(storedHash)
  ) {
    return false;
  }

  const derivedKey = await derivePasswordHash(password, salt);
  const storedKey = Buffer.from(storedHash, 'hex');
  return timingSafeEqual(derivedKey, storedKey);
};
