import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { MessageKind } from '../entities/message.entity.js';

export type MessageDocument = HydratedDocument<MessageRecord>;

@Schema({ _id: false })
export class AttachmentSubdoc {
  @Prop({ type: String, required: true })
  storageKey: string;

  @Prop({ type: String, required: true })
  originalName: string;

  @Prop({ type: String, required: true })
  mimeType: string;

  @Prop({ type: Number, required: true })
  sizeBytes: number;

  @Prop({ type: Date, required: true, default: Date.now })
  uploadedAt: Date;
}

const AttachmentSubdocSchema = SchemaFactory.createForClass(AttachmentSubdoc);

@Schema({ _id: false })
export class ReactionSubdoc {
  @Prop({ type: String, required: true })
  userId: string;

  @Prop({ type: String, required: true })
  emoji: string;

  @Prop({ type: Date, required: true, default: Date.now })
  createdAt: Date;
}

const ReactionSubdocSchema = SchemaFactory.createForClass(ReactionSubdoc);

@Schema({ timestamps: true, collection: 'messages' })
export class MessageRecord {
  @Prop({ type: String, required: true, index: true })
  conversationId: string;

  @Prop({ type: String, required: true, index: true })
  senderId: string;

  @Prop({
    type: String,
    required: true,
    enum: Object.values(MessageKind),
  })
  kind: MessageKind;

  @Prop({ type: String, default: null })
  text?: string;

  @Prop({ type: String, default: null })
  stickerCode?: string;

  @Prop({ type: [AttachmentSubdocSchema], default: [] })
  attachments: AttachmentSubdoc[];

  @Prop({ type: [ReactionSubdocSchema], default: [] })
  reactions: ReactionSubdoc[];

  @Prop({ type: String, default: null })
  replyToId?: string;

  @Prop({ type: Date, default: null })
  deletedAt?: Date;

  @Prop({ type: String, default: null })
  deletedBy?: string;

  createdAt: Date;

  updatedAt: Date;
}

export const MessageSchema = SchemaFactory.createForClass(MessageRecord);

MessageSchema.index({ conversationId: 1, createdAt: -1, _id: -1 });
MessageSchema.index({ senderId: 1, createdAt: -1 });
MessageSchema.index({ createdAt: -1, kind: 1 });
