import {
  Field,
  Float,
  ID,
  ObjectType,
  registerEnumType,
} from '@nestjs/graphql';

export enum MessageKind {
  TEXT = 'text',
  IMAGE = 'image',
  VIDEO = 'video',
  DOCUMENT = 'document',
  EMOTION = 'emotion',
  SYSTEM = 'system',
}

registerEnumType(MessageKind, { name: 'MessageKind' });

@ObjectType()
export class MessageAttachment {
  @Field()
  storageKey: string;

  @Field()
  originalName: string;

  @Field()
  mimeType: string;

  @Field(() => Float)
  sizeBytes: number;

  @Field()
  uploadedAt: Date;

  @Field()
  url: string;
}

@ObjectType()
export class MessageReaction {
  @Field(() => ID)
  userId: string;

  @Field({ nullable: true })
  displayName?: string;

  @Field()
  emoji: string;

  @Field()
  createdAt: Date;
}

@ObjectType()
export class ReplyMessagePreview {
  @Field(() => ID)
  id: string;

  @Field(() => ID)
  senderId: string;

  @Field({ nullable: true })
  senderDisplayName?: string;

  @Field(() => MessageKind)
  kind: MessageKind;

  @Field({ nullable: true })
  text?: string;

  @Field({ nullable: true })
  stickerCode?: string;

  @Field()
  isDeleted: boolean;
}

@ObjectType()
export class Message {
  @Field(() => ID)
  id: string;

  @Field(() => ID)
  conversationId: string;

  @Field(() => ID)
  senderId: string;

  @Field({ nullable: true })
  senderDisplayName?: string;

  @Field({ nullable: true })
  senderAvatarUrl?: string;

  @Field(() => MessageKind)
  kind: MessageKind;

  @Field({ nullable: true })
  text?: string;

  @Field({ nullable: true })
  stickerCode?: string;

  @Field(() => [MessageAttachment])
  attachments: MessageAttachment[];

  @Field(() => [MessageReaction])
  reactions: MessageReaction[];

  @Field(() => ID, { nullable: true })
  replyToId?: string;

  @Field(() => ReplyMessagePreview, { nullable: true })
  replyTo?: ReplyMessagePreview;

  @Field()
  isDeleted: boolean;

  @Field({ nullable: true })
  deletedAt?: Date;

  @Field(() => ID, { nullable: true })
  deletedBy?: string;

  @Field()
  createdAt: Date;

  @Field()
  updatedAt: Date;
}

@ObjectType()
export class MessagePage {
  @Field(() => [Message])
  items: Message[];

  @Field()
  hasMore: boolean;

  @Field({ nullable: true })
  nextCursor?: string;
}
