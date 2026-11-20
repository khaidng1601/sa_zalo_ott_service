import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { createHmac, randomUUID } from 'node:crypto';
import { Model } from 'mongoose';
import { CallHistoryEntry } from './entities/call-history.entity.js';
import { CallHistoryRecord } from './schemas/call-history.schema.js';
import {
  ConversationType,
  MembershipStatus,
} from '../conversations/entities/conversation.entity.js';
import {
  ConversationMemberRecord,
} from '../conversations/schemas/conversation-member.schema.js';
import {
  ConversationRecord,
} from '../conversations/schemas/conversation.schema.js';

export type DirectCallMode = 'audio' | 'video';
export type DirectCallStatus = 'ringing' | 'active' | 'ended';
export type DirectCallEndReason =
  | 'rejected'
  | 'cancelled'
  | 'hangup'
  | 'timeout'
  | 'disconnect';

export interface DirectCall {
  id: string;
  conversationId: string;
  callerId: string;
  calleeId: string;
  mode: DirectCallMode;
  status: DirectCallStatus;
  endReason?: DirectCallEndReason;
  createdAt: string;
  acceptedAt?: string;
  endedAt?: string;
  durationSeconds?: number;
}

export interface CallIceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

const isObjectId = (value: string) => /^[a-f\d]{24}$/i.test(value);

@Injectable()
export class CallsService {
  private readonly calls = new Map<string, DirectCall>();
  private readonly activeCallByUser = new Map<string, string>();

  constructor(
    @InjectModel(ConversationRecord.name)
    private readonly conversationModel: Model<ConversationRecord>,
    @InjectModel(ConversationMemberRecord.name)
    private readonly memberModel: Model<ConversationMemberRecord>,
    @InjectModel(CallHistoryRecord.name)
    private readonly callHistoryModel: Model<CallHistoryRecord>,
    private readonly configService: ConfigService,
  ) {}

  async startCall(
    callerId: string,
    calleeId: string,
    conversationId: string,
    mode: DirectCallMode,
  ): Promise<DirectCall> {
    if (
      !isObjectId(callerId) ||
      !isObjectId(calleeId) ||
      callerId === calleeId ||
      !isObjectId(conversationId)
    ) {
      throw new BadRequestException('Invalid direct-call participants.');
    }

    const conversation = await this.conversationModel
      .findOne({
        _id: conversationId,
        type: ConversationType.DIRECT,
        closedAt: null,
      })
      .exec();
    if (!conversation) {
      throw new NotFoundException('Direct conversation not found or closed.');
    }

    const members = await this.memberModel
      .find({
        conversationId,
        status: MembershipStatus.ACTIVE,
      })
      .select('userId')
      .lean()
      .exec();
    const memberIds = members.map((member) => member.userId);
    if (
      memberIds.length !== 2 ||
      !memberIds.includes(callerId) ||
      !memberIds.includes(calleeId)
    ) {
      throw new ForbiddenException(
        'A direct call is only allowed between active conversation members.',
      );
    }

    if (
      this.activeCallByUser.has(callerId) ||
      this.activeCallByUser.has(calleeId)
    ) {
      throw new ConflictException('One of the users is already in a call.');
    }

    const call: DirectCall = {
      id: randomUUID(),
      conversationId,
      callerId,
      calleeId,
      mode,
      status: 'ringing',
      createdAt: new Date().toISOString(),
    };
    this.calls.set(call.id, call);
    this.activeCallByUser.set(callerId, call.id);
    this.activeCallByUser.set(calleeId, call.id);
    return { ...call };
  }

  acceptCall(callId: string, userId: string): DirectCall {
    const call = this.getParticipantCall(callId, userId);
    if (userId !== call.calleeId || call.status !== 'ringing') {
      throw new ConflictException('This call cannot be accepted.');
    }
    call.status = 'active';
    call.acceptedAt = new Date().toISOString();
    return { ...call };
  }

  async rejectCall(callId: string, userId: string): Promise<DirectCall> {
    const call = this.getParticipantCall(callId, userId);
    if (userId !== call.calleeId || call.status !== 'ringing') {
      throw new ConflictException('This call cannot be rejected.');
    }
    return this.finishCall(call, 'rejected');
  }

  async cancelCall(callId: string, userId: string): Promise<DirectCall> {
    const call = this.getParticipantCall(callId, userId);
    if (userId !== call.callerId || call.status !== 'ringing') {
      throw new ConflictException('This call cannot be cancelled.');
    }
    return this.finishCall(call, 'cancelled');
  }

  async endCall(callId: string, userId: string): Promise<DirectCall> {
    const call = this.getParticipantCall(callId, userId);
    if (call.status !== 'active') {
      throw new ConflictException('This call is not active.');
    }
    return this.finishCall(call, 'hangup');
  }

  async timeoutCall(callId: string): Promise<DirectCall | undefined> {
    const call = this.calls.get(callId);
    if (!call || call.status !== 'ringing') return undefined;
    return this.finishCall(call, 'timeout');
  }

  async disconnectUser(userId: string): Promise<DirectCall[]> {
    const callId = this.activeCallByUser.get(userId);
    if (!callId) return [];
    const call = this.calls.get(callId);
    if (!call) {
      this.activeCallByUser.delete(userId);
      return [];
    }
    return [await this.finishCall(call, 'disconnect')];
  }

  async listCallHistory(
    userId: string,
    conversationId: string,
    limit: number,
  ): Promise<CallHistoryEntry[]> {
    if (!isObjectId(conversationId)) {
      throw new BadRequestException('Invalid conversation ID.');
    }

    const conversation = await this.conversationModel
      .findOne({ _id: conversationId, type: ConversationType.DIRECT })
      .select('_id')
      .lean()
      .exec();
    if (!conversation) {
      throw new NotFoundException('Direct conversation not found.');
    }

    const membership = await this.memberModel
      .findOne({
        conversationId,
        userId,
        status: MembershipStatus.ACTIVE,
      })
      .select('_id')
      .lean()
      .exec();
    if (!membership) {
      throw new ForbiddenException(
        'Call history is only available to active conversation members.',
      );
    }

    const safeLimit = Math.min(
      100,
      Math.max(1, Number.isFinite(limit) ? Math.trunc(limit) : 50),
    );
    const records = await this.callHistoryModel
      .find({ conversationId })
      .sort({ startedAt: -1 })
      .limit(safeLimit)
      .lean()
      .exec();

    return records.map((record) => ({
      callId: record.callId,
      conversationId: record.conversationId,
      callerId: record.callerId,
      calleeId: record.calleeId,
      mode: record.mode,
      outcome: record.outcome,
      startedAt: record.startedAt,
      connectedAt: record.connectedAt,
      endedAt: record.endedAt,
      durationSeconds: record.durationSeconds,
    }));
  }

  getOtherParticipant(call: DirectCall, userId: string): string {
    if (userId === call.callerId) return call.calleeId;
    if (userId === call.calleeId) return call.callerId;
    throw new ForbiddenException('User is not a participant in this call.');
  }

  getCallForParticipant(callId: string, userId: string): DirectCall {
    if (!/^[\da-f-]{36}$/i.test(callId)) {
      throw new BadRequestException('Invalid call ID.');
    }
    return { ...this.getParticipantCall(callId, userId) };
  }

  getSignalTarget(callId: string, userId: string): string {
    const call = this.getParticipantCall(callId, userId);
    if (call.status !== 'active') {
      throw new ConflictException('Call signaling requires an active call.');
    }
    return this.getOtherParticipant(call, userId);
  }

  getIceServers(userId: string): CallIceServer[] {
    const stunUrls = (this.configService.get<string>('WEBRTC_STUN_URLS') ?? '')
      .split(',')
      .map((url) => url.trim())
      .filter(Boolean);
    const servers: CallIceServer[] = stunUrls.map((urls) => ({ urls }));
    const turnUrls = (this.configService.get<string>('WEBRTC_TURN_URLS') ?? '')
      .split(',')
      .map((url) => url.trim())
      .filter(Boolean);
    const sharedSecret = this.configService
      .get<string>('WEBRTC_TURN_SHARED_SECRET')
      ?.trim();

    if (turnUrls.length > 0 || sharedSecret) {
      if (turnUrls.length === 0 || !sharedSecret) {
        throw new InternalServerErrorException(
          'WEBRTC_TURN_URLS and WEBRTC_TURN_SHARED_SECRET must be configured together.',
        );
      }

      const expiresAt = Math.floor(Date.now() / 1000) + 10 * 60;
      const username = `${expiresAt}:${userId}`;
      const credential = createHmac('sha1', sharedSecret)
        .update(username)
        .digest('base64');
      servers.push({ urls: turnUrls, username, credential });
    }

    return servers;
  }

  private getParticipantCall(callId: string, userId: string): DirectCall {
    const call = this.calls.get(callId);
    if (!call) throw new NotFoundException('Call not found.');
    if (call.callerId !== userId && call.calleeId !== userId) {
      throw new ForbiddenException('User is not a participant in this call.');
    }
    return call;
  }

  private async finishCall(
    call: DirectCall,
    endReason: DirectCallEndReason,
  ): Promise<DirectCall> {
    const endedAt = new Date();
    const connectedAt = call.acceptedAt
      ? new Date(call.acceptedAt)
      : undefined;
    const durationSeconds = connectedAt
      ? Math.max(0, Math.floor((endedAt.getTime() - connectedAt.getTime()) / 1000))
      : 0;
    await this.callHistoryModel.create({
      callId: call.id,
      conversationId: call.conversationId,
      callerId: call.callerId,
      calleeId: call.calleeId,
      mode: call.mode,
      outcome: endReason,
      startedAt: new Date(call.createdAt),
      connectedAt,
      endedAt,
      durationSeconds,
    });

    call.status = 'ended';
    call.endReason = endReason;
    call.endedAt = endedAt.toISOString();
    call.durationSeconds = durationSeconds;
    this.activeCallByUser.delete(call.callerId);
    this.activeCallByUser.delete(call.calleeId);
    this.calls.delete(call.id);
    return { ...call };
  }
}
