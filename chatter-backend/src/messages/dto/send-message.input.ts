import { Field, InputType } from '@nestjs/graphql';
import { MessageKind } from '../entities/message.entity.js';

@InputType()
export class AttachmentInput {
  @Field()
  storageKey: string;

  @Field()
  originalName: string;

  @Field()
  mimeType: string;
}

@InputType()
export class SendMessageInput {
  @Field()
  conversationId: string;

  @Field(() => MessageKind)
  kind: MessageKind;

  @Field({ nullable: true })
  text?: string;

  @Field({ nullable: true })
  stickerCode?: string;

  @Field(() => [AttachmentInput], { nullable: true })
  attachments?: AttachmentInput[];

  @Field({ nullable: true })
  replyToId?: string;
}
