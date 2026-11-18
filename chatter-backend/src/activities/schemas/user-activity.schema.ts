import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export enum ActivityEventType {
  ACCOUNT_CREATED = 'account.created',
  LOGIN_SUCCEEDED = 'login.succeeded',
  CONVERSATION_CREATED = 'conversation.created',
  GROUP_MEMBER_ADDED = 'group.member_added',
  GROUP_MEMBER_REMOVED = 'group.member_removed',
  MESSAGE_SENT = 'message.sent',
  MESSAGE_REACTION_ADDED = 'message.reaction_added',
  MESSAGE_DELETED = 'message.deleted',
  FILE_UPLOADED = 'file.uploaded',
}

export type SafeMetadataValue = string | number | boolean | null;

export type UserActivityDocument = HydratedDocument<UserActivityRecord>;

@Schema({ collection: 'userActivities', timestamps: false })
export class UserActivityRecord {
  @Prop({ type: String, required: true, index: true })
  actorId: string;

  @Prop({
    type: String,
    required: true,
    enum: Object.values(ActivityEventType),
  })
  type: ActivityEventType;

  @Prop({ type: String, default: null })
  conversationId?: string;

  @Prop({ type: String, default: null })
  targetUserId?: string;

  @Prop({ type: Object, default: {} })
  metadata: Record<string, SafeMetadataValue>;

  @Prop({ type: Date, required: true, default: Date.now })
  occurredAt: Date;
}

export const UserActivitySchema =
  SchemaFactory.createForClass(UserActivityRecord);

UserActivitySchema.index({ occurredAt: -1, type: 1 });
UserActivitySchema.index({ actorId: 1, occurredAt: -1 });
