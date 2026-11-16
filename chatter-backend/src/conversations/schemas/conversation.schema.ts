import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { ConversationType } from '../entities/conversation.entity.js';

export type ConversationDocument = HydratedDocument<ConversationRecord>;

@Schema({ timestamps: true, collection: 'conversations' })
export class ConversationRecord {
  @Prop({
    type: String,
    required: true,
    enum: Object.values(ConversationType),
  })
  type: ConversationType;

  @Prop({ trim: true, maxlength: 80, default: null })
  title?: string;

  @Prop({ type: String, required: true })
  createdBy: string;

  @Prop({ type: String, sparse: true, unique: true })
  directKey?: string;

  @Prop({ type: Date, default: null })
  lastMessageAt?: Date;

  @Prop({ type: Date, default: null })
  closedAt?: Date;

  createdAt: Date;

  updatedAt: Date;
}

export const ConversationSchema =
  SchemaFactory.createForClass(ConversationRecord);
ConversationSchema.index({ lastMessageAt: -1, createdAt: -1 });
