import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import {
  ConversationRole,
  ConversationType,
  MembershipStatus,
} from './entities/conversation.entity.js';
import { ConversationsService } from './conversations.service.js';
import { ConversationMemberRecord } from './schemas/conversation-member.schema.js';
import { ConversationRecord } from './schemas/conversation.schema.js';
import { UsersService } from '../users/users.service.js';

class MockConversationModel {
  static findOneMock = vi.fn();
  static findMock = vi.fn();
  static deleteOneMock = vi.fn();
  static saveMock = vi.fn();

  constructor(private readonly data: Record<string, unknown>) {}

  save() {
    return MockConversationModel.saveMock(this.data);
  }

  static findOne(filter: unknown) {
    return MockConversationModel.findOneMock(filter);
  }

  static find(filter: unknown) {
    return MockConversationModel.findMock(filter);
  }

  static deleteOne(filter: unknown) {
    return MockConversationModel.deleteOneMock(filter);
  }
}

class MockMemberModel {
  static insertManyMock = vi.fn();
  static findOneMock = vi.fn();
  static findMock = vi.fn();
  static deleteManyMock = vi.fn();
  static saveMock = vi.fn();

  constructor(private readonly data: Record<string, unknown>) {}

  save() {
    return MockMemberModel.saveMock(this.data);
  }

  static insertMany(data: unknown[]) {
    return MockMemberModel.insertManyMock(data);
  }

  static findOne(filter: unknown) {
    return MockMemberModel.findOneMock(filter);
  }

  static find(filter: unknown) {
    return MockMemberModel.findMock(filter);
  }

  static deleteMany(filter: unknown) {
    return MockMemberModel.deleteManyMock(filter);
  }
}

const userId = '507f1f77bcf86cd799439011';
const otherUserId = '507f1f77bcf86cd799439012';

describe('ConversationsService', () => {
  let service: ConversationsService;
  const usersService = {
    findActiveById: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    usersService.findActiveById.mockResolvedValue({ id: otherUserId });
    const module = await Test.createTestingModule({
      providers: [
        ConversationsService,
        {
          provide: getModelToken(ConversationRecord.name),
          useValue: MockConversationModel,
        },
        {
          provide: getModelToken(ConversationMemberRecord.name),
          useValue: MockMemberModel,
        },
        { provide: UsersService, useValue: usersService },
      ],
    }).compile();
    service = module.get(ConversationsService);
  });

  it('creates a group with the requester as owner and unique active members', async () => {
    const now = new Date();
    MockConversationModel.saveMock.mockResolvedValue({
      id: '507f1f77bcf86cd799439013',
      type: ConversationType.GROUP,
      title: 'Project',
      createdBy: userId,
      createdAt: now,
    });
    MockMemberModel.insertManyMock.mockResolvedValue([]);

    await expect(
      service.createGroup(userId, ' Project ', [otherUserId, otherUserId]),
    ).resolves.toMatchObject({
      type: ConversationType.GROUP,
      title: 'Project',
      createdBy: userId,
    });

    const members = MockMemberModel.insertManyMock.mock.calls[0][0];
    expect(members).toHaveLength(2);
    expect(members).toContainEqual(
      expect.objectContaining({
        userId,
        role: ConversationRole.OWNER,
        status: MembershipStatus.ACTIVE,
      }),
    );
    expect(members).toContainEqual(
      expect.objectContaining({
        userId: otherUserId,
        role: ConversationRole.MEMBER,
        status: MembershipStatus.ACTIVE,
      }),
    );
  });

  it('rejects invalid group titles before writing to MongoDB', async () => {
    await expect(service.createGroup(userId, '  ', [])).rejects.toThrow(
      BadRequestException,
    );
    expect(MockConversationModel.saveMock).not.toHaveBeenCalled();
  });

  it('rejects creation when a requested account is not active', async () => {
    usersService.findActiveById.mockResolvedValue(null);

    await expect(
      service.createGroup(userId, 'Project', [otherUserId]),
    ).rejects.toThrow(NotFoundException);
    expect(MockConversationModel.saveMock).not.toHaveBeenCalled();
  });

  it('cleans up a partially created group when adding its members fails', async () => {
    const conversationId = '507f1f77bcf86cd799439013';
    MockConversationModel.saveMock.mockResolvedValue({
      id: conversationId,
      type: ConversationType.GROUP,
      title: 'Project',
      createdBy: userId,
      createdAt: new Date(),
    });
    MockMemberModel.insertManyMock.mockRejectedValue(new Error('insert failed'));
    MockMemberModel.deleteManyMock.mockResolvedValue({ deletedCount: 0 });
    MockConversationModel.deleteOneMock.mockResolvedValue({ deletedCount: 1 });

    await expect(
      service.createGroup(userId, 'Project', [otherUserId]),
    ).rejects.toThrow('insert failed');
    expect(MockMemberModel.deleteManyMock).toHaveBeenCalledWith({
      conversationId,
    });
    expect(MockConversationModel.deleteOneMock).toHaveBeenCalledWith({
      _id: conversationId,
    });
  });
});
