import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CallHistoryDocument = HydratedDocument<CallHistoryRecord>;

@Schema({ collection: 'callHistory' })
export class CallHistoryRecord {
  @Prop({ type: String, required: true, unique: true })
  callId: string;

  @Prop({ type: String, required: true, index: true })
  conversationId: string;

  @Prop({ type: String, required: true })
  callerId: string;

  @Prop({ type: String, required: true })
  calleeId: string;

  @Prop({ type: String, required: true, enum: ['audio', 'video'] })
  mode: 'audio' | 'video';

  @Prop({
    type: String,
    required: true,
    enum: ['rejected', 'cancelled', 'hangup', 'timeout', 'disconnect'],
  })
  outcome: string;

  @Prop({ type: Date, required: true })
  startedAt: Date;

  @Prop({ type: Date, default: null })
  connectedAt?: Date | null;

  @Prop({ type: Date, required: true })
  endedAt: Date;

  @Prop({ type: Number, required: true, min: 0 })
  durationSeconds: number;
}

export const CallHistorySchema =
  SchemaFactory.createForClass(CallHistoryRecord);

CallHistorySchema.index({ conversationId: 1, startedAt: -1 });
