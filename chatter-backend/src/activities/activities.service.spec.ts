import { ActivitiesService } from './activities.service.js';
import { ActivityEventType } from './schemas/user-activity.schema.js';

describe('ActivitiesService', () => {
  const saveMock = vi.fn();
  class MockActivityModel {
    constructor(private readonly data: Record<string, unknown>) {}
    save() {
      return saveMock(this.data);
    }
  }

  let service: ActivitiesService;

  beforeEach(() => {
    saveMock.mockReset();
    saveMock.mockResolvedValue({});
    service = new ActivitiesService(MockActivityModel as never, {} as never);
  });

  it('strips sensitive fields from metadata before persisting activity events', async () => {
    await service.record({
      actorId: '507f1f77bcf86cd799439011',
      type: ActivityEventType.MESSAGE_SENT,
      conversationId: '507f1f77bcf86cd799439012',
      metadata: {
        kind: 'document',
        sizeBytes: 2048,
        text: 'private message content should never be logged',
        accessToken: 'secret-jwt',
        password: 'raw-password',
      },
    });

    expect(saveMock).toHaveBeenCalledOnce();
    const persisted = saveMock.mock.calls[0][0];
    expect(persisted.metadata).toEqual({
      kind: 'document',
      sizeBytes: 2048,
    });
    expect(persisted.metadata).not.toHaveProperty('text');
    expect(persisted.metadata).not.toHaveProperty('accessToken');
    expect(persisted.metadata).not.toHaveProperty('password');
  });
});
