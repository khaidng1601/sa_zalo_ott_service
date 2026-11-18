export type GraphQLUserRole = "USER" | "ADMIN";
export type GraphQLUserStatus = "ACTIVE" | "DISABLED";
export type GraphQLConversationType = "DIRECT" | "GROUP";
export type GraphQLConversationRole = "OWNER" | "ADMIN" | "MEMBER";
export type GraphQLMessageKind =
  | "TEXT"
  | "IMAGE"
  | "VIDEO"
  | "DOCUMENT"
  | "EMOTION"
  | "SYSTEM";

export interface CurrentUserProfile {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string | null;
  status: GraphQLUserStatus;
  role: GraphQLUserRole;
  lastSeenAt?: string | null;
}

export interface DirectoryUser {
  id: string;
  displayName: string;
  email?: string | null;
  avatarUrl?: string | null;
  lastSeenAt?: string | null;
  isContact?: boolean | null;
}

export interface ConversationMember {
  id?: string;
  userId: string;
  displayName: string;
  email?: string | null;
  avatarUrl?: string | null;
  isOnline?: boolean | null;
  role: GraphQLConversationRole;
}

export interface Conversation {
  id: string;
  type: GraphQLConversationType;
  title?: string | null;
  createdBy: string;
  lastMessageAt?: string | null;
  lastMessagePreview?: string | null;
  closedAt?: string | null;
  memberCount?: number | null;
  createdAt: string;
  members: ConversationMember[];
}

export interface MessageAttachment {
  storageKey: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
  url: string;
}

export interface MessageReaction {
  userId: string;
  displayName?: string | null;
  emoji: string;
  createdAt: string;
}

export interface ReplyMessagePreview {
  id: string;
  senderId: string;
  senderDisplayName?: string | null;
  kind: GraphQLMessageKind;
  text?: string | null;
  stickerCode?: string | null;
  isDeleted: boolean;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  senderDisplayName?: string | null;
  senderAvatarUrl?: string | null;
  kind: GraphQLMessageKind;
  text?: string | null;
  stickerCode?: string | null;
  attachments: MessageAttachment[];
  reactions: MessageReaction[];
  replyToId?: string | null;
  replyTo?: ReplyMessagePreview | null;
  isDeleted: boolean;
  deletedAt?: string | null;
  createdAt: string;
}

export const getInitials = (name: string) =>
  (name || "U")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("")
    .toLocaleUpperCase("vi") || "U";
