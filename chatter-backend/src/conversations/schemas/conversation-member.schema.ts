import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import {
  ConversationRole,
  MembershipStatus,
} from '../entities/conversation.entity.js';

export type ConversationMemberDocument =
  HydratedDocument<ConversationMemberRecord>;

@Schema({ timestamps: true, collection: 'conversationMembers' })
export class ConversationMemberRecord {
  @Prop({ type: String, required: true, index: true })
  conversationId: string;

  @Prop({ type: String, required: true, index: true })
  userId: string;

  @Prop({
    type: String,
    required: true,
    enum: Object.values(ConversationRole),
    default: ConversationRole.MEMBER,
  })
  role: ConversationRole;

  @Prop({
    type: String,
    required: true,
    enum: Object.values(MembershipStatus),
    default: MembershipStatus.ACTIVE,
  })
  status: MembershipStatus;

  @Prop({ type: Date, required: true, default: Date.now })
  joinedAt: Date;

  @Prop({ type: Date, default: null })
  leftAt?: Date;

  @Prop({ type: Date, default: null })
  lastReadAt?: Date;

  createdAt: Date;

  updatedAt: Date;
}

export const ConversationMemberSchema =
  SchemaFactory.createForClass(ConversationMemberRecord);
ConversationMemberSchema.index(
  { conversationId: 1, userId: 1 },
  { unique: true },
);
ConversationMemberSchema.index({ userId: 1, status: 1, conversationId: 1 });
