import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserRole, UserStatus } from './entities/user.entity.js';
import { UserRecord } from './schemas/user.schema.js';
import { hashPassword, verifyPassword } from './password.js';

const DUMMY_PASSWORD_HASH = `scrypt$${'0'.repeat(32)}$${'0'.repeat(128)}`;

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(UserRecord.name)
    private readonly userModel: Model<UserRecord>,
  ) {}

  async createAccount(data: {
    email: string;
    password: string;
    displayName: string;
    avatarUrl?: string;
  }): Promise<User> {
    const email = data.email.trim().toLowerCase();
    const displayName = data.displayName.trim();
    if (
      email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
      throw new BadRequestException('A valid email address is required.');
    }

    if (data.password.length < 8 || data.password.length > 128) {
      throw new BadRequestException(
        'Password must contain between 8 and 128 characters.',
      );
    }

    if (displayName.length === 0 || displayName.length > 80) {
      throw new BadRequestException(
        'Display name must contain between 1 and 80 characters.',
      );
    }

    const passwordHash = await hashPassword(data.password);

    try {
      const user = new this.userModel({
        email,
        passwordHash,
        displayName,
        avatarUrl: data.avatarUrl?.trim() || null,
        status: UserStatus.ACTIVE,
        role: UserRole.USER,
      });
      const savedUser = await user.save();

      return this.toPublicUser(savedUser);
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 11000
      ) {
        throw new ConflictException(
          'An account with this email already exists.',
        );
      }

      throw error;
    }
  }

  async authenticate(emailInput: string, password: string): Promise<User> {
    const email = emailInput.trim().toLowerCase();
    const user = await this.userModel
      .findOne({ email })
      .select('+passwordHash')
      .exec();
    const passwordMatches = await verifyPassword(
      password,
      user?.passwordHash ?? DUMMY_PASSWORD_HASH,
    );

    if (
      !user ||
      user.status !== UserStatus.ACTIVE ||
      !passwordMatches
    ) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    return this.toPublicUser(user);
  }

  async findActiveById(id: string): Promise<User | null> {
    if (!/^[a-f\d]{24}$/i.test(id)) return null;

    const user = await this.userModel
      .findOne({ _id: id, status: UserStatus.ACTIVE })
      .exec();

    return user ? this.toPublicUser(user) : null;
  }

  async findActiveByEmail(emailInput: string): Promise<User | null> {
    const email = emailInput.trim().toLowerCase();
    if (
      email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
      return null;
    }

    const user = await this.userModel
      .findOne({ email, status: UserStatus.ACTIVE })
      .exec();
    return user ? this.toPublicUser(user) : null;
  }

  private toPublicUser(user: {
    id: string;
    email: string;
    displayName: string;
    avatarUrl?: string | null;
    status: UserStatus;
    role: UserRole;
    createdAt: Date;
    updatedAt: Date;
  }): User {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl ?? undefined,
      status: user.status,
      role: user.role,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
