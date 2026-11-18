import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserRole, UserStatus } from './entities/user.entity.js';
import { UserDirectoryEntry } from './entities/user-directory-entry.entity.js';
import { ContactRecord } from './schemas/contact.schema.js';
import { UserRecord } from './schemas/user.schema.js';
import { hashPassword, verifyPassword } from './password.js';

const DUMMY_PASSWORD_HASH = `scrypt$${'0'.repeat(32)}$${'0'.repeat(128)}`;
const isValidObjectId = (id: string) => /^[a-f\d]{24}$/i.test(id);
const escapeRegex = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(UserRecord.name)
    private readonly userModel: Model<UserRecord>,
    @Optional()
    @InjectModel(ContactRecord.name)
    private readonly contactModel?: Model<ContactRecord>,
    @Optional()
    private readonly configService?: ConfigService,
  ) {}

  async createAccount(data: {
    email: string;
    password: string;
    displayName: string;
    avatarUrl?: string;
    role?: UserRole;
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

    const bootstrapEmail = this.configService
      ?.get<string>('ADMIN_BOOTSTRAP_EMAIL')
      ?.trim()
      .toLowerCase();
    const resolvedRole =
      data.role ??
      (bootstrapEmail && bootstrapEmail === email
        ? UserRole.ADMIN
        : UserRole.USER);

    const passwordHash = await hashPassword(data.password);

    try {
      const user = new this.userModel({
        email,
        passwordHash,
        displayName,
        avatarUrl: data.avatarUrl?.trim() || null,
        status: UserStatus.ACTIVE,
        role: resolvedRole,
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

    const now = new Date();
    user.lastSeenAt = now;
    if (typeof this.userModel.updateOne === 'function') {
      await this.userModel.updateOne({ _id: user.id }, { lastSeenAt: now }).exec();
    }

    return this.toPublicUser(user);
  }

  async touchLastSeen(userId: string): Promise<void> {
    if (!isValidObjectId(userId)) return;
    if (typeof this.userModel.updateOne !== 'function') return;
    await this.userModel
      .updateOne({ _id: userId }, { lastSeenAt: new Date() })
      .exec();
  }

  async findActiveById(id: string): Promise<User | null> {
    if (!isValidObjectId(id)) return null;

    const user = await this.userModel
      .findOne({ _id: id, status: UserStatus.ACTIVE })
      .exec();

    return user ? this.toPublicUser(user) : null;
  }

  async findByIds(ids: string[]): Promise<Map<string, User>> {
    const validIds = [...new Set(ids)].filter(isValidObjectId);
    const map = new Map<string, User>();
    if (validIds.length === 0 || typeof this.userModel.find !== 'function') {
      return map;
    }
    const records = await this.userModel.find({ _id: { $in: validIds } }).exec();
    for (const record of records) {
      map.set(record.id, this.toPublicUser(record));
    }
    return map;
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

  async updateProfile(
    userId: string,
    input: { displayName?: string; avatarUrl?: string },
  ): Promise<User> {
    if (!isValidObjectId(userId)) {
      throw new BadRequestException('Invalid user ID.');
    }
    const user = await this.userModel
      .findOne({ _id: userId, status: UserStatus.ACTIVE })
      .exec();
    if (!user) {
      throw new NotFoundException('Active account not found.');
    }

    if (input.displayName !== undefined) {
      const trimmedName = input.displayName.trim();
      if (trimmedName.length === 0 || trimmedName.length > 80) {
        throw new BadRequestException(
          'Display name must contain between 1 and 80 characters.',
        );
      }
      user.displayName = trimmedName;
    }

    if (input.avatarUrl !== undefined) {
      const trimmedUrl = input.avatarUrl.trim();
      if (trimmedUrl.length > 500) {
        throw new BadRequestException('Avatar URL is too long.');
      }
      user.avatarUrl = trimmedUrl || undefined;
    }

    const saved = await user.save();
    return this.toPublicUser(saved);
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<boolean> {
    if (!isValidObjectId(userId)) {
      throw new BadRequestException('Invalid user ID.');
    }
    if (newPassword.length < 8 || newPassword.length > 128) {
      throw new BadRequestException(
        'New password must contain between 8 and 128 characters.',
      );
    }

    const user = await this.userModel
      .findOne({ _id: userId, status: UserStatus.ACTIVE })
      .select('+passwordHash')
      .exec();
    if (!user) {
      throw new NotFoundException('Active account not found.');
    }

    const matches = await verifyPassword(currentPassword, user.passwordHash);
    if (!matches) {
      throw new UnauthorizedException('Current password is incorrect.');
    }

    user.passwordHash = await hashPassword(newPassword);
    await user.save();
    return true;
  }

  async searchDirectory(
    requesterId: string,
    query?: string,
    limitInput = 25,
  ): Promise<UserDirectoryEntry[]> {
    const limit = Math.min(Math.max(Math.trunc(limitInput || 25), 1), 50);
    const trimmed = query?.trim() ?? '';

    const filter: Record<string, unknown> = {
      status: UserStatus.ACTIVE,
      _id: { $ne: requesterId },
    };

    if (trimmed.length > 0) {
      const pattern = new RegExp(escapeRegex(trimmed), 'i');
      filter.$or = [{ displayName: pattern }, { email: pattern }];
    }

    const users = await this.userModel
      .find(filter)
      .sort({ displayName: 1 })
      .limit(limit)
      .exec();

    const contactSet = await this.getContactIdSet(requesterId);

    return users.map((u) => ({
      id: u.id,
      displayName: u.displayName,
      email: u.email,
      avatarUrl: u.avatarUrl ?? undefined,
      lastSeenAt: u.lastSeenAt ?? undefined,
      isContact: contactSet.has(u.id),
    }));
  }

  async listContacts(ownerId: string): Promise<UserDirectoryEntry[]> {
    if (!this.contactModel) return [];
    const contacts = await this.contactModel
      .find({ ownerId })
      .sort({ createdAt: -1 })
      .exec();
    if (contacts.length === 0) return [];

    const contactIds = contacts.map((c) => c.contactUserId);
    const users = await this.userModel
      .find({ _id: { $in: contactIds }, status: UserStatus.ACTIVE })
      .sort({ displayName: 1 })
      .exec();

    return users.map((u) => ({
      id: u.id,
      displayName: u.displayName,
      email: u.email,
      avatarUrl: u.avatarUrl ?? undefined,
      lastSeenAt: u.lastSeenAt ?? undefined,
      isContact: true,
    }));
  }

  async addContact(
    ownerId: string,
    contactUserId: string,
  ): Promise<UserDirectoryEntry> {
    if (!this.contactModel) {
      throw new BadRequestException('Contact storage is not initialized.');
    }
    if (!isValidObjectId(contactUserId)) {
      throw new BadRequestException('Invalid contact user ID.');
    }
    if (ownerId === contactUserId) {
      throw new BadRequestException('You cannot add yourself as a contact.');
    }

    const target = await this.findActiveById(contactUserId);
    if (!target) {
      throw new NotFoundException('Active user not found.');
    }

    await this.contactModel
      .updateOne(
        { ownerId, contactUserId },
        { $setOnInsert: { ownerId, contactUserId } },
        { upsert: true },
      )
      .exec();

    return {
      id: target.id,
      displayName: target.displayName,
      email: target.email,
      avatarUrl: target.avatarUrl,
      lastSeenAt: target.lastSeenAt,
      isContact: true,
    };
  }

  async removeContact(ownerId: string, contactUserId: string): Promise<boolean> {
    if (!this.contactModel || !isValidObjectId(contactUserId)) return false;
    const res = await this.contactModel
      .deleteOne({ ownerId, contactUserId })
      .exec();
    return (res.deletedCount ?? 0) > 0;
  }

  async adminListUsers(filter: {
    search?: string;
    status?: UserStatus;
    limit?: number;
  }): Promise<User[]> {
    const limit = Math.min(Math.max(Math.trunc(filter.limit || 50), 1), 200);
    const query: Record<string, unknown> = {};
    if (filter.status) {
      query.status = filter.status;
    }
    if (filter.search?.trim()) {
      const pattern = new RegExp(escapeRegex(filter.search.trim()), 'i');
      query.$or = [{ email: pattern }, { displayName: pattern }];
    }

    const users = await this.userModel
      .find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .exec();
    return users.map((u) => this.toPublicUser(u));
  }

  async adminSetUserStatus(
    actorAdminId: string,
    targetUserId: string,
    status: UserStatus,
  ): Promise<User> {
    if (!isValidObjectId(targetUserId)) {
      throw new BadRequestException('Invalid user ID.');
    }
    if (actorAdminId === targetUserId && status === UserStatus.DISABLED) {
      throw new ForbiddenException('You cannot disable your own admin account.');
    }
    const user = await this.userModel.findById(targetUserId).exec();
    if (!user) throw new NotFoundException('User not found.');
    user.status = status;
    const saved = await user.save();
    return this.toPublicUser(saved);
  }

  async adminSetUserRole(
    actorAdminId: string,
    targetUserId: string,
    role: UserRole,
  ): Promise<User> {
    if (!isValidObjectId(targetUserId)) {
      throw new BadRequestException('Invalid user ID.');
    }
    if (actorAdminId === targetUserId && role !== UserRole.ADMIN) {
      throw new ForbiddenException('You cannot demote your own admin role.');
    }
    const user = await this.userModel.findById(targetUserId).exec();
    if (!user) throw new NotFoundException('User not found.');
    user.role = role;
    const saved = await user.save();
    return this.toPublicUser(saved);
  }

  private async getContactIdSet(ownerId: string): Promise<Set<string>> {
    if (!this.contactModel) return new Set();
    const contacts = await this.contactModel
      .find({ ownerId })
      .select('contactUserId')
      .exec();
    return new Set(contacts.map((c) => c.contactUserId));
  }

  private toPublicUser(user: {
    id: string;
    email: string;
    displayName: string;
    avatarUrl?: string | null;
    status: UserStatus;
    role: UserRole;
    lastSeenAt?: Date | null;
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
      lastSeenAt: user.lastSeenAt ?? undefined,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
