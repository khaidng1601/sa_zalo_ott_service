import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Model, type Connection } from 'mongoose';
import {
  ActiveGroupStat,
  ActivityStats,
  DailyActivityPoint,
  MediaUsageByKind,
  MessageKindCount,
  MyActivitySummary,
} from './entities/activity-stats.entity.js';
import {
  ActivityEventType,
  SafeMetadataValue,
  UserActivityRecord,
} from './schemas/user-activity.schema.js';

const FORBIDDEN_METADATA_KEYS = new Set([
  'password',
  'passwordhash',
  'accesstoken',
  'token',
  'secret',
  'text',
  'content',
  'sig',
  'signature',
  'url',
  'signedurl',
]);

const PAYLOAD_KINDS = ['text', 'image', 'video', 'document', 'emotion'] as const;
const MEDIA_KINDS = ['image', 'video', 'document'] as const;

export interface RecordActivityInput {
  actorId: string;
  type: ActivityEventType;
  conversationId?: string;
  targetUserId?: string;
  metadata?: Record<string, SafeMetadataValue | undefined>;
  occurredAt?: Date;
}

@Injectable()
export class ActivitiesService {
  private readonly logger = new Logger(ActivitiesService.name);

  constructor(
    @InjectModel(UserActivityRecord.name)
    private readonly activityModel: Model<UserActivityRecord>,
    @InjectConnection()
    private readonly connection: Connection,
  ) {}

  sanitizeMetadata(
    metadata?: Record<string, SafeMetadataValue | undefined>,
  ): Record<string, SafeMetadataValue> {
    if (!metadata) return {};
    const clean: Record<string, SafeMetadataValue> = {};
    for (const [key, value] of Object.entries(metadata)) {
      if (value === undefined) continue;
      if (FORBIDDEN_METADATA_KEYS.has(key.toLowerCase())) continue;
      if (
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean' ||
        value === null
      ) {
        clean[key] = value;
      }
    }
    return clean;
  }

  async record(input: RecordActivityInput): Promise<void> {
    try {
      const doc = new this.activityModel({
        actorId: input.actorId,
        type: input.type,
        conversationId: input.conversationId ?? null,
        targetUserId: input.targetUserId ?? null,
        metadata: this.sanitizeMetadata(input.metadata),
        occurredAt: input.occurredAt ?? new Date(),
      });
      await doc.save();
    } catch (error) {
      this.logger.warn(
        `Failed to record activity ${input.type}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async getSystemStats(
    daysInput = 7,
    fromInput?: Date,
    toInput?: Date,
  ): Promise<ActivityStats> {
    const days = Math.min(Math.max(Math.trunc(daysInput || 7), 1), 90);
    const to = toInput ? new Date(toInput) : new Date();
    const from = fromInput
      ? new Date(fromInput)
      : new Date(to.getTime() - (days - 1) * 86_400_000);

    if (!fromInput) {
      from.setUTCHours(0, 0, 0, 0);
    }

    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
      throw new BadRequestException('Invalid analytics time range.');
    }

    const now = new Date();
    const dauStart = new Date(now.getTime() - 24 * 3600 * 1000);
    const mauStart = new Date(now.getTime() - 30 * 86_400_000);

    const usersCol = this.connection.collection('users');
    const convsCol = this.connection.collection('conversations');
    const membersCol = this.connection.collection('conversationMembers');
    const messagesCol = this.connection.collection('messages');

    const [
      totalAccounts,
      activeAccountsTotal,
      disabledAccountsTotal,
      dauActors,
      mauActors,
      loginActorsInRange,
      anyActiveActorsInRange,
      eventCountsRaw,
      totalGroups,
      newGroupsInRange,
      messagesByKindRaw,
      recalledMessagesInRange,
      mediaEventsRaw,
      dailyRaw,
      groupMessageCountsRaw,
    ] = await Promise.all([
      usersCol.countDocuments({}),
      usersCol.countDocuments({ status: 'active' }),
      usersCol.countDocuments({ status: 'disabled' }),
      this.activityModel.distinct('actorId', {
        occurredAt: { $gte: dauStart, $lte: now },
      }),
      this.activityModel.distinct('actorId', {
        occurredAt: { $gte: mauStart, $lte: now },
      }),
      this.activityModel.distinct('actorId', {
        type: ActivityEventType.LOGIN_SUCCEEDED,
        occurredAt: { $gte: from, $lte: to },
      }),
      this.activityModel.distinct('actorId', {
        occurredAt: { $gte: from, $lte: to },
      }),
      this.activityModel.aggregate<{ _id: string; count: number }>([
        { $match: { occurredAt: { $gte: from, $lte: to } } },
        { $group: { _id: '$type', count: { $sum: 1 } } },
      ]),
      convsCol.countDocuments({ type: 'group' }),
      convsCol.countDocuments({
        type: 'group',
        createdAt: { $gte: from, $lte: to },
      }),
      messagesCol
        .aggregate<{ _id: string; count: number }>([
          {
            $match: {
              createdAt: { $gte: from, $lte: to },
              kind: { $in: [...PAYLOAD_KINDS] },
            },
          },
          { $group: { _id: '$kind', count: { $sum: 1 } } },
        ])
        .toArray(),
      messagesCol.countDocuments({
        createdAt: { $gte: from, $lte: to },
        deletedAt: { $ne: null },
      }),
      this.activityModel.aggregate<{
        _id: string;
        count: number;
        totalBytes: number;
      }>([
        {
          $match: {
            type: ActivityEventType.FILE_UPLOADED,
            occurredAt: { $gte: from, $lte: to },
          },
        },
        {
          $group: {
            _id: '$metadata.kind',
            count: { $sum: 1 },
            totalBytes: {
              $sum: { $ifNull: ['$metadata.sizeBytes', 0] },
            },
          },
        },
      ]),
      this.activityModel.aggregate<{
        _id: string;
        actors: string[];
        newAccounts: number;
        messagesSent: number;
        filesUploaded: number;
        reactionsAdded: number;
      }>([
        { $match: { occurredAt: { $gte: from, $lte: to } } },
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m-%d', date: '$occurredAt' },
            },
            actors: { $addToSet: '$actorId' },
            newAccounts: {
              $sum: {
                $cond: [{ $eq: ['$type', ActivityEventType.ACCOUNT_CREATED] }, 1, 0],
              },
            },
            messagesSent: {
              $sum: {
                $cond: [{ $eq: ['$type', ActivityEventType.MESSAGE_SENT] }, 1, 0],
              },
            },
            filesUploaded: {
              $sum: {
                $cond: [{ $eq: ['$type', ActivityEventType.FILE_UPLOADED] }, 1, 0],
              },
            },
            reactionsAdded: {
              $sum: {
                $cond: [
                  { $eq: ['$type', ActivityEventType.MESSAGE_REACTION_ADDED] },
                  1,
                  0,
                ],
              },
            },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      messagesCol
        .aggregate<{ _id: string; messageCount: number }>([
          { $match: { createdAt: { $gte: from, $lte: to } } },
          { $group: { _id: '$conversationId', messageCount: { $sum: 1 } } },
          { $sort: { messageCount: -1 } },
        ])
        .toArray(),
    ]);

    const eventMap = new Map(eventCountsRaw.map((e) => [e._id, e.count]));
    const kindMap = new Map(messagesByKindRaw.map((m) => [m._id, m.count]));
    const messagesByKind: MessageKindCount[] = PAYLOAD_KINDS.map((kind) => ({
      kind,
      count: kindMap.get(kind) ?? 0,
    }));
    const totalMessagesInRange = messagesByKind.reduce(
      (sum, item) => sum + item.count,
      0,
    );

    const mediaMap = new Map(
      mediaEventsRaw.map((item) => [
        item._id,
        { count: item.count, totalBytes: item.totalBytes },
      ]),
    );
    const mediaUsageByKind: MediaUsageByKind[] = MEDIA_KINDS.map((kind) => ({
      kind,
      count: mediaMap.get(kind)?.count ?? 0,
      totalBytes: mediaMap.get(kind)?.totalBytes ?? 0,
    }));
    const totalStorageBytes = mediaUsageByKind.reduce(
      (sum, item) => sum + item.totalBytes,
      0,
    );

    const dailyMap = new Map(dailyRaw.map((d) => [d._id, d]));
    const dailySeries: DailyActivityPoint[] = [];
    const cursor = new Date(from);
    cursor.setUTCHours(0, 0, 0, 0);
    const endDay = new Date(to);
    endDay.setUTCHours(0, 0, 0, 0);

    while (cursor <= endDay && dailySeries.length < 92) {
      const key = cursor.toISOString().slice(0, 10);
      const entry = dailyMap.get(key);
      dailySeries.push({
        date: key,
        activeUsers: entry?.actors.length ?? 0,
        newAccounts: entry?.newAccounts ?? 0,
        messagesSent: entry?.messagesSent ?? 0,
        filesUploaded: entry?.filesUploaded ?? 0,
        reactionsAdded: entry?.reactionsAdded ?? 0,
      });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    // Active groups & top groups
    const activeConvIds = groupMessageCountsRaw
      .map((item) => item._id)
      .filter((id) => typeof id === 'string' && /^[a-f\d]{24}$/i.test(id));

    let activeGroupsInRange = 0;
    const topActiveGroups: ActiveGroupStat[] = [];

    if (activeConvIds.length > 0) {
      const groupConvs = await convsCol
        .find({ type: 'group' })
        .project({ _id: 1, title: 1 })
        .toArray();
      const groupTitleById = new Map(
        groupConvs.map((g) => [String(g._id), String(g.title || 'Nhóm chưa đặt tên')]),
      );
      const activeGroupEntries = groupMessageCountsRaw.filter((item) =>
        groupTitleById.has(item._id),
      );
      activeGroupsInRange = activeGroupEntries.length;

      for (const entry of activeGroupEntries.slice(0, 5)) {
        const memberCount = await membersCol.countDocuments({
          conversationId: entry._id,
          status: 'active',
        });
        topActiveGroups.push({
          conversationId: entry._id,
          title: groupTitleById.get(entry._id) ?? 'Nhóm',
          memberCount,
          messageCount: entry.messageCount,
        });
      }
    }

    const activeUsersSet = new Set([
      ...loginActorsInRange,
      ...anyActiveActorsInRange,
    ]);

    return {
      from,
      to,
      totalAccounts,
      activeAccountsTotal,
      disabledAccountsTotal,
      dau: dauActors.length,
      mau: mauActors.length,
      activeUsersInRange: activeUsersSet.size,
      newAccountsInRange: eventMap.get(ActivityEventType.ACCOUNT_CREATED) ?? 0,
      totalGroups,
      newGroupsInRange,
      activeGroupsInRange,
      totalMessagesInRange,
      recalledMessagesInRange,
      reactionsInRange:
        eventMap.get(ActivityEventType.MESSAGE_REACTION_ADDED) ?? 0,
      groupMembersAddedInRange:
        eventMap.get(ActivityEventType.GROUP_MEMBER_ADDED) ?? 0,
      groupMembersRemovedInRange:
        eventMap.get(ActivityEventType.GROUP_MEMBER_REMOVED) ?? 0,
      totalStorageBytes,
      messagesByKind,
      mediaUsageByKind,
      dailySeries,
      topActiveGroups,
    };
  }

  async getMyActivitySummary(
    userId: string,
    daysInput = 7,
  ): Promise<MyActivitySummary> {
    const days = Math.min(Math.max(Math.trunc(daysInput || 7), 1), 90);
    const from = new Date(Date.now() - days * 86_400_000);

    const membersCol = this.connection.collection('conversationMembers');
    const convsCol = this.connection.collection('conversations');
    const messagesCol = this.connection.collection('messages');

    const [
      messagesByKindRaw,
      reactionsCount,
      uploadAgg,
      activeMemberships,
    ] = await Promise.all([
      messagesCol
        .aggregate<{ _id: string; count: number }>([
          {
            $match: {
              senderId: userId,
              createdAt: { $gte: from },
              kind: { $in: [...PAYLOAD_KINDS] },
            },
          },
          { $group: { _id: '$kind', count: { $sum: 1 } } },
        ])
        .toArray(),
      this.activityModel.countDocuments({
        actorId: userId,
        type: ActivityEventType.MESSAGE_REACTION_ADDED,
        occurredAt: { $gte: from },
      }),
      this.activityModel.aggregate<{ count: number; totalBytes: number }>([
        {
          $match: {
            actorId: userId,
            type: ActivityEventType.FILE_UPLOADED,
            occurredAt: { $gte: from },
          },
        },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            totalBytes: { $sum: { $ifNull: ['$metadata.sizeBytes', 0] } },
          },
        },
      ]),
      membersCol
        .find({ userId, status: 'active' })
        .project({ conversationId: 1 })
        .toArray(),
    ]);

    const kindMap = new Map(messagesByKindRaw.map((m) => [m._id, m.count]));
    const messagesByKind: MessageKindCount[] = PAYLOAD_KINDS.map((kind) => ({
      kind,
      count: kindMap.get(kind) ?? 0,
    }));
    const messagesSent = messagesByKind.reduce((s, x) => s + x.count, 0);

    let groupsJoined = 0;
    let directChatsCount = 0;
    if (activeMemberships.length > 0) {
      const allConvs = await convsCol
        .find({})
        .project({ _id: 1, type: 1, closedAt: 1 })
        .toArray();
      const memberConvSet = new Set(
        activeMemberships.map((m) => String(m.conversationId)),
      );
      for (const conv of allConvs) {
        if (conv.closedAt) continue;
        if (!memberConvSet.has(String(conv._id))) continue;
        if (conv.type === 'group') groupsJoined += 1;
        if (conv.type === 'direct') directChatsCount += 1;
      }
    }

    return {
      days,
      messagesSent,
      reactionsAdded: reactionsCount,
      filesUploaded: uploadAgg[0]?.count ?? 0,
      totalUploadedBytes: uploadAgg[0]?.totalBytes ?? 0,
      groupsJoined,
      directChatsCount,
      messagesByKind,
    };
  }
}
