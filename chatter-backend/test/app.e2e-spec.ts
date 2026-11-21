import { rm } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { getConnectionToken } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import { io, type Socket } from 'socket.io-client';
import { AppModule } from './../src/app.module.js';

/**
 * End-to-end acceptance tests for the three requirement groups in docs/Detai2026.pdf:
 *   1. Account and group management
 *   2. 1-1 and group chat with text, image, video, document and emotion
 *   3. User activity statistics
 * The whole app runs against a throwaway MongoDB database (see test/e2e-env.ts).
 */

interface TestUser {
  id: string;
  email: string;
  token: string;
}

const PASSWORD = 'Password@123';

// Smallest valid sample of each file type the app accepts.
const SAMPLE_FILES = {
  IMAGE: {
    name: 'photo.png',
    type: 'image/png',
    bytes: Buffer.from(
      '89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C4890000000D49444154789C6300010000050001',
      'hex',
    ),
  },
  VIDEO: {
    name: 'clip.mp4',
    type: 'video/mp4',
    bytes: Buffer.concat([Buffer.from('000000186674797069736F6D', 'hex'), Buffer.alloc(64)]),
  },
  DOCUMENT: {
    name: 'report.pdf',
    type: 'application/pdf',
    bytes: Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n'),
  },
} as const;

describe('Chatter OTT acceptance (e2e)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let alice: TestUser;
  let bob: TestUser;
  let carol: TestUser;
  let adminToken: string;
  let groupId: string;
  let directId: string;

  const gql = async <T = Record<string, any>>(
    query: string,
    variables: Record<string, unknown> = {},
    token?: string,
  ): Promise<{ data?: T; errors?: { message: string }[] }> => {
    const res = await fetch(`${baseUrl}/graphql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ query, variables }),
    });
    return (await res.json()) as { data?: T; errors?: { message: string }[] };
  };

  /** Runs a GraphQL operation and fails the test if it returns errors. */
  const ok = async <T = Record<string, any>>(
    query: string,
    variables: Record<string, unknown> = {},
    token?: string,
  ): Promise<T> => {
    const body = await gql<T>(query, variables, token);
    expect(body.errors, JSON.stringify(body.errors)).toBeUndefined();
    return body.data as T;
  };

  const register = async (name: string, email = `${name}.${Date.now()}@e2e.test`): Promise<TestUser> => {
    const data = await ok<{ register: { accessToken: string; user: { id: string } } }>(
      `mutation ($input: CreateUserInput!) {
        register(createUserInput: $input) { accessToken user { id } }
      }`,
      { input: { email, password: PASSWORD, displayName: `E2E ${name}` } },
    );
    return { id: data.register.user.id, email, token: data.register.accessToken };
  };

  const upload = async (
    token: string,
    conversationId: string,
    file: { name: string; type: string; bytes: Buffer },
  ) => {
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(file.bytes)], { type: file.type }), file.name);
    const res = await fetch(`${baseUrl}/uploads/conversation/${conversationId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    return { status: res.status, body: (await res.json()) as { storageKey: string } };
  };

  const sendMessage = (token: string, input: Record<string, unknown>) =>
    ok<{ sendMessage: { id: string; kind: string; attachments: { url: string }[] } }>(
      `mutation ($input: SendMessageInput!) {
        sendMessage(input: $input) { id kind text stickerCode attachments { url originalName mimeType } }
      }`,
      { input },
      token,
    );

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0, '127.0.0.1');
    const { port } = app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;

    [alice, bob, carol] = [await register('alice'), await register('bob'), await register('carol')];
    adminToken = (await register('admin', process.env.ADMIN_BOOTSTRAP_EMAIL)).token;
  });

  afterAll(async () => {
    if (app) {
      await app.get<Connection>(getConnectionToken()).dropDatabase();
      await app.close();
    }
    if (process.env.UPLOAD_DIR) {
      await rm(process.env.UPLOAD_DIR, { recursive: true, force: true });
    }
  });

  it('reports healthy over REST and GraphQL', async () => {
    expect((await fetch(baseUrl)).status).toBe(200);
    expect((await ok<{ health: string }>('{ health }')).health).toBe('ok');
  });

  describe('1. Account and group management', () => {
    it('logs in with the right password and rejects a wrong one', async () => {
      const good = await gql(`mutation { login(email: "${alice.email}", password: "${PASSWORD}") { accessToken } }`);
      expect(good.errors).toBeUndefined();
      const bad = await gql(`mutation { login(email: "${alice.email}", password: "wrong-password") { accessToken } }`);
      expect(bad.errors).toBeDefined();
    });

    it('rejects requests without a valid token', async () => {
      expect((await gql('{ me { id } }')).errors).toBeDefined();
      expect((await gql('{ me { id } }', {}, 'not-a-token')).errors).toBeDefined();
    });

    it('updates the profile and finds users in the directory', async () => {
      const data = await ok<{ updateMyProfile: { displayName: string } }>(
        `mutation { updateMyProfile(input: { displayName: "Alice Updated" }) { displayName } }`,
        {},
        alice.token,
      );
      expect(data.updateMyProfile.displayName).toBe('Alice Updated');

      const search = await ok<{ searchUsers: { id: string }[] }>(
        `{ searchUsers(query: "E2E") { id } }`,
        {},
        alice.token,
      );
      expect(search.searchUsers.map((u) => u.id)).toEqual(expect.arrayContaining([bob.id, carol.id]));
    });

    it('adds a contact', async () => {
      await ok(`mutation { addContact(userId: "${bob.id}") { id } }`, {}, alice.token);
      const data = await ok<{ myContacts: { id: string }[] }>('{ myContacts { id } }', {}, alice.token);
      expect(data.myContacts.map((c) => c.id)).toContain(bob.id);
    });

    it('creates a group and manages its members', async () => {
      const created = await ok<{ createGroup: { id: string; type: string } }>(
        `mutation ($input: CreateGroupInput!) { createGroup(input: $input) { id type } }`,
        { input: { title: 'E2E group', memberIds: [bob.id] } },
        alice.token,
      );
      expect(created.createGroup.type).toBe('GROUP');
      groupId = created.createGroup.id;

      await ok(`mutation { addGroupMember(conversationId: "${groupId}", userId: "${carol.id}") { userId } }`, {}, alice.token);
      await ok(`mutation { setGroupAdmin(conversationId: "${groupId}", userId: "${bob.id}", isAdmin: true) { role } }`, {}, alice.token);
      await ok(`mutation { updateGroupTitle(conversationId: "${groupId}", title: "E2E group renamed") { title } }`, {}, alice.token);

      const members = await ok<{ conversationMembers: { userId: string }[] }>(
        `{ conversationMembers(conversationId: "${groupId}") { userId } }`,
        {},
        alice.token,
      );
      expect(members.conversationMembers.map((m) => m.userId)).toEqual(
        expect.arrayContaining([alice.id, bob.id, carol.id]),
      );

      const list = await ok<{ myConversations: { id: string }[] }>('{ myConversations { id } }', {}, bob.token);
      expect(list.myConversations.map((c) => c.id)).toContain(groupId);
    });

    it('stops a removed member from reading the group', async () => {
      await ok(`mutation { removeGroupMember(conversationId: "${groupId}", userId: "${carol.id}") { userId } }`, {}, alice.token);
      const res = await gql(`{ messages(conversationId: "${groupId}") { items { id } } }`, {}, carol.token);
      expect(res.errors).toBeDefined();
    });

    it('does not let a normal member remove the group owner', async () => {
      const res = await gql(
        `mutation { removeGroupMember(conversationId: "${groupId}", userId: "${alice.id}") { userId } }`,
        {},
        bob.token,
      );
      expect(res.errors).toBeDefined();
    });
  });

  describe('2. 1-1 and group chat', () => {
    beforeAll(async () => {
      const data = await ok<{ openDirectConversation: { id: string; type: string } }>(
        `mutation { openDirectConversation(userId: "${bob.id}") { id type } }`,
        {},
        alice.token,
      );
      expect(data.openDirectConversation.type).toBe('DIRECT');
      directId = data.openDirectConversation.id;
    });

    for (const target of ['direct', 'group'] as const) {
      const conversationId = () => (target === 'direct' ? directId : groupId);

      it(`[${target}] sends a text message and a reaction`, async () => {
        const sent = await sendMessage(alice.token, { conversationId: conversationId(), kind: 'TEXT', text: 'Xin chào' });
        expect(sent.sendMessage.kind).toBe('TEXT');

        const reacted = await ok<{ reactToMessage: { reactions: { emoji: string }[] } }>(
          `mutation { reactToMessage(messageId: "${sent.sendMessage.id}", emoji: "👍") { reactions { emoji } } }`,
          {},
          bob.token,
        );
        expect(reacted.reactToMessage.reactions.map((r) => r.emoji)).toContain('👍');
      });

      for (const kind of ['IMAGE', 'VIDEO', 'DOCUMENT'] as const) {
        it(`[${target}] sends a ${kind.toLowerCase()} the other member can download`, async () => {
          const file = SAMPLE_FILES[kind];
          const up = await upload(alice.token, conversationId(), file);
          expect(up.status).toBe(201);

          const sent = await sendMessage(alice.token, {
            conversationId: conversationId(),
            kind,
            attachments: [{ storageKey: up.body.storageKey, originalName: file.name, mimeType: file.type }],
          });
          expect(sent.sendMessage.kind).toBe(kind);

          const download = await fetch(`${baseUrl}${sent.sendMessage.attachments[0].url}`, {
            headers: { Authorization: `Bearer ${bob.token}` },
          });
          expect(download.status).toBe(200);
          expect(Buffer.from(await download.arrayBuffer()).equals(file.bytes)).toBe(true);
        });
      }

      it(`[${target}] sends an emotion sticker`, async () => {
        const sent = await sendMessage(alice.token, { conversationId: conversationId(), kind: 'EMOTION', stickerCode: '❤️' });
        expect(sent.sendMessage.kind).toBe('EMOTION');
      });
    }

    it('shows the recipient all five message kinds in history', async () => {
      const data = await ok<{ messages: { items: { kind: string }[] } }>(
        `{ messages(conversationId: "${directId}", limit: 50) { items { kind } } }`,
        {},
        bob.token,
      );
      expect(new Set(data.messages.items.map((m) => m.kind))).toEqual(
        new Set(['TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT', 'EMOTION']),
      );
    });

    it('lets the sender recall a message but not someone else', async () => {
      const sent = await sendMessage(alice.token, { conversationId: directId, kind: 'TEXT', text: 'to recall' });
      const byOther = await gql(`mutation { deleteMessage(messageId: "${sent.sendMessage.id}") { deletedAt } }`, {}, bob.token);
      expect(byOther.errors).toBeDefined();

      const data = await ok<{ deleteMessage: { deletedAt: string | null } }>(
        `mutation { deleteMessage(messageId: "${sent.sendMessage.id}") { deletedAt } }`,
        {},
        alice.token,
      );
      expect(data.deleteMessage.deletedAt).toBeTruthy();
    });

    it('rejects disallowed file types and uploads from non-members', async () => {
      const exe = await upload(alice.token, directId, {
        name: 'virus.exe',
        type: 'application/x-msdownload',
        bytes: Buffer.from('MZ'),
      });
      expect(exe.status).toBe(400);

      // An executable renamed to .png with a faked MIME type.
      const disguised = await upload(alice.token, directId, {
        name: 'cute-cat.png',
        type: 'image/png',
        bytes: Buffer.from('4d5a90000300000004000000ffff0000', 'hex'),
      });
      expect(disguised.status).toBe(400);

      const outsider = await upload(carol.token, directId, SAMPLE_FILES.IMAGE);
      expect(outsider.status).toBe(403);
    });

    it('delivers new messages in real time over Socket.IO', async () => {
      const socket: Socket = io(baseUrl, {
        path: '/socket.io/',
        auth: { token: bob.token },
        transports: ['websocket'],
        reconnection: false,
      });
      try {
        await new Promise<void>((resolve, reject) => {
          socket.once('connect', () => resolve());
          socket.once('connect_error', reject);
        });
        const received = new Promise<{ text: string; conversationId: string }>((resolve) =>
          socket.once('message.created', resolve),
        );
        await sendMessage(alice.token, { conversationId: directId, kind: 'TEXT', text: 'realtime ping' });
        const message = await received;
        expect(message).toMatchObject({ text: 'realtime ping', conversationId: directId });
      } finally {
        socket.close();
      }
    });

    it('persists completed direct-call history for both conversation members', async () => {
      const callerSocket = io(`${baseUrl}/calls`, {
        path: '/socket.io/',
        auth: { token: alice.token },
        transports: ['websocket'],
        reconnection: false,
      });
      const calleeSocket = io(`${baseUrl}/calls`, {
        path: '/socket.io/',
        auth: { token: bob.token },
        transports: ['websocket'],
        reconnection: false,
      });

      const waitForConnect = (socket: Socket) =>
        new Promise<void>((resolve, reject) => {
          socket.once('connect', resolve);
          socket.once('connect_error', reject);
        });
      const waitForEvent = <T>(socket: Socket, event: string) =>
        new Promise<T>((resolve) => socket.once(event, resolve));
      const emitAck = (
        socket: Socket,
        event: string,
        payload: Record<string, unknown>,
      ) =>
        new Promise<{ ok: boolean; callId?: string; message?: string }>(
          (resolve, reject) => {
            socket
              .timeout(5000)
              .emit(
                event,
                payload,
                (
                  error: Error | null,
                  response: { ok: boolean; callId?: string; message?: string },
                ) => {
                  if (error) reject(error);
                  else resolve(response);
                },
              );
          },
        );

      try {
        await Promise.all([waitForConnect(callerSocket), waitForConnect(calleeSocket)]);
        const incomingCall = waitForEvent<{
          callId: string;
          conversationId: string;
        }>(calleeSocket, 'call.incoming');
        const invite = await emitAck(callerSocket, 'call.invite', {
          conversationId: directId,
          targetUserId: bob.id,
          mode: 'audio',
        });
        expect(invite.ok).toBe(true);
        expect(await incomingCall).toMatchObject({
          callId: invite.callId,
          conversationId: directId,
        });

        const acceptedCall = waitForEvent<{ callId: string }>(
          callerSocket,
          'call.accepted',
        );
        expect(
          await emitAck(calleeSocket, 'call.accept', { callId: invite.callId }),
        ).toMatchObject({ ok: true });
        await expect(acceptedCall).resolves.toMatchObject({
          callId: invite.callId,
        });

        const callerHistoryEvent = waitForEvent<{ callId: string; outcome: string }>(
          callerSocket,
          'call.history.updated',
        );
        const calleeHistoryEvent = waitForEvent<{ callId: string; outcome: string }>(
          calleeSocket,
          'call.history.updated',
        );
        expect(
          await emitAck(callerSocket, 'call.end', { callId: invite.callId }),
        ).toMatchObject({ ok: true });
        await expect(callerHistoryEvent).resolves.toMatchObject({
          callId: invite.callId,
          outcome: 'hangup',
        });
        await expect(calleeHistoryEvent).resolves.toMatchObject({
          callId: invite.callId,
          outcome: 'hangup',
        });

        const history = await ok<{
          callHistory: {
            callId: string;
            callerId: string;
            calleeId: string;
            mode: string;
            outcome: string;
            durationSeconds: number;
          }[];
        }>(
          `query ($conversationId: String!) {
            callHistory(conversationId: $conversationId) {
              callId callerId calleeId mode outcome durationSeconds
            }
          }`,
          { conversationId: directId },
          alice.token,
        );
        expect(history.callHistory[0]).toMatchObject({
          callId: invite.callId,
          callerId: alice.id,
          calleeId: bob.id,
          mode: 'audio',
          outcome: 'hangup',
        });

        const outsiderHistory = await gql(
          `{ callHistory(conversationId: "${directId}") { callId } }`,
          {},
          carol.token,
        );
        expect(outsiderHistory.errors).toBeDefined();
      } finally {
        callerSocket.close();
        calleeSocket.close();
      }
    });

    it('disconnects sockets that use an invalid token', async () => {
      const socket = io(baseUrl, {
        path: '/socket.io/',
        auth: { token: 'not-a-token' },
        transports: ['websocket'],
        reconnection: false,
      });
      try {
        await new Promise<void>((resolve) => socket.once('disconnect', () => resolve()));
        expect(socket.connected).toBe(false);
      } finally {
        socket.close();
      }
    });
  });

  describe('3. User activity statistics', () => {
    it('gives admins system-wide statistics for every message kind', async () => {
      const data = await ok<{
        activityStats: {
          totalAccounts: number;
          totalMessagesInRange: number;
          messagesByKind: { kind: string; count: number }[];
          mediaUsageByKind: { kind: string; count: number }[];
          dailySeries: { date: string }[];
        };
      }>(
        `{ activityStats(days: 7) {
            totalAccounts totalMessagesInRange
            messagesByKind { kind count }
            mediaUsageByKind { kind count }
            dailySeries { date }
        } }`,
        {},
        adminToken,
      );
      const stats = data.activityStats;
      expect(stats.totalAccounts).toBeGreaterThanOrEqual(3);
      expect(stats.totalMessagesInRange).toBeGreaterThan(0);
      for (const kind of ['text', 'image', 'video', 'document', 'emotion']) {
        expect(stats.messagesByKind.find((k) => k.kind === kind)?.count).toBeGreaterThan(0);
      }
      expect(stats.dailySeries).toHaveLength(7);
    });

    it('keeps system statistics admin-only', async () => {
      expect((await gql('{ activityStats(days: 7) { totalAccounts } }', {}, alice.token)).errors).toBeDefined();
    });

    it('gives each user a personal summary', async () => {
      const data = await ok<{ myActivitySummary: { messagesSent: number; filesUploaded: number } }>(
        '{ myActivitySummary(days: 7) { messagesSent filesUploaded } }',
        {},
        alice.token,
      );
      expect(data.myActivitySummary.messagesSent).toBeGreaterThan(0);
      expect(data.myActivitySummary.filesUploaded).toBeGreaterThan(0);
    });
  });

  describe('System administration', () => {
    it('lets an admin disable an account, which blocks login and existing tokens', async () => {
      await ok(`mutation { adminSetUserStatus(userId: "${carol.id}", status: DISABLED) { status } }`, {}, adminToken);
      expect((await gql(`mutation { login(email: "${carol.email}", password: "${PASSWORD}") { accessToken } }`)).errors).toBeDefined();
      expect((await gql('{ me { id } }', {}, carol.token)).errors).toBeDefined();
    });

    it('lets an admin list and close groups', async () => {
      const list = await ok<{ adminConversations: { id: string }[] }>('{ adminConversations { id } }', {}, adminToken);
      expect(list.adminConversations.map((c) => c.id)).toContain(groupId);
      await ok(`mutation { adminSetConversationClosed(conversationId: "${groupId}", closed: true) { id } }`, {}, adminToken);
    });

    it('keeps admin operations away from normal users', async () => {
      expect((await gql('{ adminUsers { id } }', {}, alice.token)).errors).toBeDefined();
    });
  });
});
