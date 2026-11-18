import { BadRequestException } from '@nestjs/common';
import { MessageKind } from './entities/message.entity.js';
import { MessagesService } from './messages.service.js';

describe('MessagesService', () => {
  const senderId = '507f1f77bcf86cd799439011';
  const conversationId = '507f1f77bcf86cd799439012';
  const saveMock = vi.fn();

  class MockMessageModel {
    constructor(private readonly data: Record<string, unknown>) {}
    save() {
      return saveMock(this.data);
    }
    static find = vi.fn(() => ({ exec: vi.fn().mockResolvedValue([]) }));
    static findOne = vi.fn();
    static findById = vi.fn();
  }

  const conversationsService = {
    assertOpenConversationMembership: vi.fn(),
    touchLastMessage: vi.fn(),
    getActiveMemberIds: vi.fn(),
  };

  const usersService = {
    findByIds: vi.fn(),
    touchLastSeen: vi.fn(),
  };

  const storageService = {
    verifyStoredAttachment: vi.fn(),
    classifyFile: vi.fn(),
    signDownloadUrl: vi.fn((key: string) => `/uploads/files/${key}?sig=ok`),
  };

  const activitiesService = {
    record: vi.fn(),
  };

  const realtimeGateway = {
    emitToUsers: vi.fn(),
  };

  let service: MessagesService;

  beforeEach(() => {
    vi.clearAllMocks();
    conversationsService.assertOpenConversationMembership.mockResolvedValue({
      member: { role: 'member' },
    });
    conversationsService.touchLastMessage.mockResolvedValue(undefined);
    conversationsService.getActiveMemberIds.mockResolvedValue([senderId]);
    usersService.findByIds.mockResolvedValue(
      new Map([[senderId, { id: senderId, displayName: 'Minh' }]]),
    );
    usersService.touchLastSeen.mockResolvedValue(undefined);

    service = new MessagesService(
      MockMessageModel as never,
      conversationsService as never,
      usersService as never,
      storageService as never,
      activitiesService as never,
      realtimeGateway as never,
    );
  });

  it('persists text, emotion, and document messages and broadcasts realtime events', async () => {
    const now = new Date();
    saveMock.mockImplementation(async (data) => ({
      ...data,
      id: '507f1f77bcf86cd799439099',
      createdAt: now,
      updatedAt: now,
    }));

    // 1. Text message
    const textMsg = await service.sendMessage(senderId, {
      conversationId,
      kind: MessageKind.TEXT,
      text: '  Xin chào nhóm!  ',
    });
    expect(textMsg.text).toBe('Xin chào nhóm!');
    expect(realtimeGateway.emitToUsers).toHaveBeenCalledWith(
      [senderId],
      'message.created',
      expect.objectContaining({ kind: MessageKind.TEXT }),
    );

    // 2. Emotion / Sticker message
    const emotionMsg = await service.sendMessage(senderId, {
      conversationId,
      kind: MessageKind.EMOTION,
      stickerCode: 'zalo-hello',
    });
    expect(emotionMsg.stickerCode).toBe('zalo-hello');

    // 3. Document attachment message
    storageService.verifyStoredAttachment.mockResolvedValue({
      sizeBytes: 12000,
      fullPath: '/app/uploads/files/doc.pdf',
    });
    storageService.classifyFile.mockReturnValue({
      kind: 'document',
      mimeType: 'application/pdf',
    });

    const docMsg = await service.sendMessage(senderId, {
      conversationId,
      kind: MessageKind.DOCUMENT,
      attachments: [
        {
          storageKey: `${conversationId}/123-report.pdf`,
          originalName: 'report.pdf',
          mimeType: 'application/pdf',
        },
      ],
    });
    expect(docMsg.attachments).toHaveLength(1);
    expect(docMsg.attachments[0].url).toContain('?sig=ok');
  });

  it('rejects empty text messages', async () => {
    await expect(
      service.sendMessage(senderId, {
        conversationId,
        kind: MessageKind.TEXT,
        text: '   ',
      }),
    ).rejects.toThrow(BadRequestException);
  });
});
