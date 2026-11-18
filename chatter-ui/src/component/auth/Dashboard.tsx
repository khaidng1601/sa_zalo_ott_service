import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Avatar,
  Badge,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  InputBase,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
} from "@mui/material";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import AdminPanelSettingsRoundedIcon from "@mui/icons-material/AdminPanelSettingsRounded";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import BarChartRoundedIcon from "@mui/icons-material/BarChartRounded";
import ChatRoundedIcon from "@mui/icons-material/ChatRounded";
import GroupsRoundedIcon from "@mui/icons-material/GroupsRounded";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import LogoutRoundedIcon from "@mui/icons-material/LogoutRounded";
import PeopleAltRoundedIcon from "@mui/icons-material/PeopleAltRounded";
import PersonAddAltRoundedIcon from "@mui/icons-material/PersonAddAltRounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import SettingsRoundedIcon from "@mui/icons-material/SettingsRounded";
import { graphqlRequest } from "../../services/graphql";
import { ChatRealtimeClient, connectChatSocket } from "../../services/realtime";
import {
  ChatMessage,
  Conversation,
  CurrentUserProfile,
  getInitials,
} from "../../types/chat";
import AdminManagementPanel from "../admin/AdminManagementPanel";
import AnalyticsDashboard from "../analytics/AnalyticsDashboard";
import ChatWindow from "../chat/ChatWindow";
import GroupInfoDrawer from "../chat/GroupInfoDrawer";
import ContactsDirectoryPanel from "../contacts/ContactsDirectoryPanel";
import ProfileDialog from "../profile/ProfileDialog";

interface UserProfile {
  id: string;
  displayName: string;
}

const getConversationName = (
  conversation: Conversation,
  currentUserId: string,
) =>
  conversation.type === "GROUP"
    ? conversation.title || "Nhóm chưa đặt tên"
    : conversation.members.find((member) => member.userId !== currentUserId)
        ?.displayName ?? "Người dùng";

const getPartnerAvatar = (
  conversation: Conversation,
  currentUserId: string,
): string | undefined => {
  if (conversation.type === "GROUP") return undefined;
  return (
    conversation.members.find((member) => member.userId !== currentUserId)
      ?.avatarUrl ?? undefined
  );
};

type Section = "messages" | "contacts" | "groups" | "analytics" | "admin";

const Dashboard = ({
  onLogout,
  currentUserId,
  currentUser,
  onUserUpdated,
}: {
  onLogout?: () => void;
  currentUserId: string;
  currentUser?: CurrentUserProfile | null;
  onUserUpdated?: (updated: CurrentUserProfile) => void;
}) => {
  const isMobile = useMediaQuery("(max-width:760px)");
  const isSystemAdmin = currentUser?.role === "ADMIN";

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [activeSection, setActiveSection] = useState<Section>("messages");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createMode, setCreateMode] = useState<"direct" | "group">("direct");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [groupTitle, setGroupTitle] = useState("");
  const [selectedMembers, setSelectedMembers] = useState<UserProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const [infoDrawerOpen, setInfoDrawerOpen] = useState(false);
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());
  const [typingByConv, setTypingByConv] = useState<
    Record<string, Record<string, string>>
  >({});
  const [incomingEventMessage, setIncomingEventMessage] = useState<{
    type: "created" | "updated" | "deleted";
    message: ChatMessage;
    seq: number;
  } | null>(null);

  const realtimeRef = useRef<ChatRealtimeClient | null>(null);

  const refreshConversations = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await graphqlRequest<{ myConversations: Conversation[] }>(
        `query MyConversations {
          myConversations {
            id type title createdBy createdAt lastMessageAt lastMessagePreview
            members { userId displayName email avatarUrl isOnline role }
          }
        }`,
      );
      setConversations(data.myConversations);
      setError("");
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Không thể tải cuộc trò chuyện.",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshConversations();
  }, [refreshConversations]);

  useEffect(() => {
    const client = connectChatSocket<ChatMessage>({
      onMessageCreated: (msg) => {
        setIncomingEventMessage({
          type: "created",
          message: msg,
          seq: Date.now() + Math.random(),
        });
        setConversations((prev) => {
          const exists = prev.some((c) => c.id === msg.conversationId);
          if (!exists) {
            void refreshConversations();
            return prev;
          }
          const preview =
            msg.kind === "IMAGE"
              ? "[Hình ảnh]"
              : msg.kind === "VIDEO"
                ? "[Video]"
                : msg.kind === "DOCUMENT"
                  ? `[Tài liệu] ${msg.attachments?.[0]?.originalName ?? ""}`
                  : msg.kind === "EMOTION"
                    ? "[Biểu cảm]"
                    : msg.text || "";
          const updated = prev.map((c) =>
            c.id === msg.conversationId
              ? {
                  ...c,
                  lastMessageAt: msg.createdAt,
                  lastMessagePreview: preview,
                }
              : c,
          );
          return [...updated].sort((a, b) => {
            const ta = new Date(a.lastMessageAt || a.createdAt).getTime();
            const tb = new Date(b.lastMessageAt || b.createdAt).getTime();
            return tb - ta;
          });
        });
      },
      onMessageUpdated: (msg) => {
        setIncomingEventMessage({
          type: "updated",
          message: msg,
          seq: Date.now() + Math.random(),
        });
      },
      onMessageDeleted: (msg) => {
        setIncomingEventMessage({
          type: "deleted",
          message: msg,
          seq: Date.now() + Math.random(),
        });
      },
      onConversationUpdated: () => {
        void refreshConversations();
      },
      onTypingUpdated: ({ conversationId, userId, displayName, isTyping }) => {
        if (userId === currentUserId) return;
        setTypingByConv((prev) => {
          const convMap = { ...(prev[conversationId] ?? {}) };
          if (isTyping) {
            convMap[userId] = displayName;
          } else {
            delete convMap[userId];
          }
          return { ...prev, [conversationId]: convMap };
        });
      },
      onPresenceSnapshot: ({ onlineUserIds: ids }) => {
        setOnlineUserIds(new Set(ids));
      },
      onPresenceUpdated: ({ userId, isOnline }) => {
        setOnlineUserIds((prev) => {
          const next = new Set(prev);
          if (isOnline) next.add(userId);
          else next.delete(userId);
          return next;
        });
      },
    });

    realtimeRef.current = client;
    return () => {
      client?.disconnect();
      realtimeRef.current = null;
    };
  }, [currentUserId, refreshConversations]);

  useEffect(() => {
    if (selectedId) {
      realtimeRef.current?.joinConversation(selectedId);
    }
  }, [selectedId]);

  const navItems: Array<{
    id: Section;
    label: string;
    icon: React.ReactNode;
  }> = [
    { id: "messages", label: "Tin nhắn", icon: <ChatRoundedIcon /> },
    { id: "contacts", label: "Danh bạ", icon: <PeopleAltRoundedIcon /> },
    { id: "groups", label: "Nhóm", icon: <GroupsRoundedIcon /> },
    { id: "analytics", label: "Thống kê", icon: <BarChartRoundedIcon /> },
    ...(isSystemAdmin
      ? [
          {
            id: "admin" as const,
            label: "Quản trị hệ thống",
            icon: <AdminPanelSettingsRoundedIcon />,
          },
        ]
      : []),
  ];

  const selectedConversation = conversations.find(
    (conversation) => conversation.id === selectedId,
  );

  const visibleConversations = conversations.filter((conversation) => {
    const name = getConversationName(conversation, currentUserId);
    const searchText = search.toLocaleLowerCase("vi");
    const matchesSearch = name.toLocaleLowerCase("vi").includes(searchText);
    const matchesSection =
      activeSection === "messages" ||
      (activeSection === "contacts" && conversation.type === "DIRECT") ||
      (activeSection === "groups" && conversation.type === "GROUP");
    return matchesSearch && matchesSection;
  });

  const isFullWidthSection =
    activeSection === "analytics" || activeSection === "admin";
  const showConversationList =
    !isFullWidthSection && (!isMobile || selectedId === null);

  const sectionTitle =
    activeSection === "contacts"
      ? "Danh bạ"
      : activeSection === "groups"
        ? "Nhóm"
        : "Tin nhắn";

  const selectConversation = (conversation: Conversation) => {
    setSelectedId(conversation.id);
  };

  const handleOpenDirectByUserId = async (targetUserId: string) => {
    setError("");
    try {
      const data = await graphqlRequest<{
        openDirectConversation: { id: string };
      }>(
        "mutation OpenDirect($userId: String!) { openDirectConversation(userId: $userId) { id } }",
        { userId: targetUserId },
      );
      await refreshConversations();
      setActiveSection("messages");
      setSelectedId(data.openDirectConversation.id);
    } catch (openErr) {
      setError(
        openErr instanceof Error
          ? openErr.message
          : "Không thể mở cuộc trò chuyện.",
      );
    }
  };

  const resetCreateDialog = () => {
    setCreateDialogOpen(false);
    setRecipientEmail("");
    setGroupTitle("");
    setSelectedMembers([]);
    setCreateMode("direct");
    setError("");
  };

  const lookupUser = async (email: string): Promise<UserProfile> => {
    const data = await graphqlRequest<{ userByEmail: UserProfile | null }>(
      "query UserByEmail($email: String!) { userByEmail(email: $email) { id displayName } }",
      { email },
    );
    if (!data.userByEmail) {
      throw new Error("Không tìm thấy tài khoản đang hoạt động với email này.");
    }
    if (data.userByEmail.id === currentUserId) {
      throw new Error("Bạn không thể tạo cuộc trò chuyện với chính mình.");
    }
    return data.userByEmail;
  };

  const addSelectedMember = async () => {
    const email = recipientEmail.trim();
    if (!email) return;
    setIsSubmitting(true);
    setError("");
    try {
      const user = await lookupUser(email);
      if (selectedMembers.some((member) => member.id === user.id)) {
        throw new Error("Tài khoản này đã được thêm vào nhóm.");
      }
      if (selectedMembers.length >= 99) {
        throw new Error("Nhóm có thể có tối đa 100 thành viên, bao gồm bạn.");
      }
      setSelectedMembers((members) => [...members, user]);
      setRecipientEmail("");
    } catch (lookupError) {
      setError(
        lookupError instanceof Error
          ? lookupError.message
          : "Không thể tìm tài khoản.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const createConversation = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);
    try {
      let conversationId: string;
      if (createMode === "direct") {
        const user = await lookupUser(recipientEmail.trim());
        const data = await graphqlRequest<{
          openDirectConversation: { id: string };
        }>(
          "mutation OpenDirect($userId: String!) { openDirectConversation(userId: $userId) { id } }",
          { userId: user.id },
        );
        conversationId = data.openDirectConversation.id;
      } else {
        if (!groupTitle.trim()) throw new Error("Vui lòng nhập tên nhóm.");
        if (selectedMembers.length === 0) {
          throw new Error("Hãy thêm ít nhất một thành viên vào nhóm.");
        }
        const data = await graphqlRequest<{ createGroup: { id: string } }>(
          "mutation CreateGroup($input: CreateGroupInput!) { createGroup(input: $input) { id } }",
          {
            input: {
              title: groupTitle.trim(),
              memberIds: selectedMembers.map((member) => member.id),
            },
          },
        );
        conversationId = data.createGroup.id;
      }
      await refreshConversations();
      setActiveSection("messages");
      setSelectedId(conversationId);
      resetCreateDialog();
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Không thể tạo cuộc trò chuyện.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const myRoleInSelected = selectedConversation?.members.find(
    (m) => m.userId === currentUserId,
  )?.role;
  const canManageSelectedGroup =
    selectedConversation?.type === "GROUP" &&
    (myRoleInSelected === "OWNER" || myRoleInSelected === "ADMIN");

  const activeTypingUsers = selectedConversation
    ? Object.values(typingByConv[selectedConversation.id] ?? {})
    : [];

  return (
    <Box
      sx={{
        display: "flex",
        width: "100%",
        height: "100dvh",
        minHeight: 560,
        overflow: "hidden",
        bgcolor: "#f4f6f9",
        color: "#202a36",
        fontFamily: '"Roboto", "Arial", sans-serif',
      }}
    >
      {/* Left Navigation Rail */}
      <Box
        component="nav"
        aria-label="Điều hướng chính"
        sx={{
          width: isMobile ? 56 : 68,
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          py: 2,
          gap: 1.5,
          bgcolor: "#0866ff",
          color: "white",
        }}
      >
        <Box
          sx={{
            width: 40,
            height: 40,
            mb: 1.5,
            display: "grid",
            placeItems: "center",
            borderRadius: 2.5,
            bgcolor: "rgba(255,255,255,.18)",
          }}
        >
          <ChatRoundedIcon />
        </Box>
        {navItems.map((item) => (
          <Tooltip key={item.label} title={item.label} placement="right">
            <IconButton
              aria-label={item.label}
              aria-pressed={activeSection === item.id}
              onClick={() => {
                setActiveSection(item.id);
                setSelectedId(null);
              }}
              sx={{
                width: 44,
                height: 44,
                color: "white",
                borderRadius: 2.5,
                bgcolor:
                  activeSection === item.id
                    ? "rgba(255,255,255,.22)"
                    : "transparent",
                "&:hover": { bgcolor: "rgba(255,255,255,.16)" },
              }}
            >
              {item.icon}
            </IconButton>
          </Tooltip>
        ))}

        <Box sx={{ flex: 1 }} />

        <Tooltip title="Hồ sơ & Cài đặt" placement="right">
          <IconButton
            aria-label="Cài đặt"
            onClick={() => setProfileDialogOpen(true)}
            sx={{ color: "white" }}
          >
            <SettingsRoundedIcon />
          </IconButton>
        </Tooltip>

        {onLogout && (
          <Tooltip title="Đăng xuất" placement="right">
            <IconButton
              aria-label="Đăng xuất"
              onClick={onLogout}
              sx={{ color: "white" }}
            >
              <LogoutRoundedIcon />
            </IconButton>
          </Tooltip>
        )}

        <Tooltip
          title={currentUser ? `${currentUser.displayName} (${currentUser.email})` : "Hồ sơ"}
          placement="right"
        >
          <Avatar
            src={currentUser?.avatarUrl || undefined}
            onClick={() => setProfileDialogOpen(true)}
            sx={{
              width: 38,
              height: 38,
              mb: 0.5,
              bgcolor: "#f1b878",
              fontSize: 13.5,
              fontWeight: 700,
              cursor: "pointer",
              border: "2px solid rgba(255,255,255,0.65)",
            }}
          >
            {getInitials(currentUser?.displayName || "AN")}
          </Avatar>
        </Tooltip>
      </Box>

      {/* Middle Conversation Sidebar */}
      <Box
        sx={{
          width: isMobile ? "calc(100% - 56px)" : { sm: 320, md: 348 },
          flexShrink: 0,
          display: showConversationList ? "flex" : "none",
          flexDirection: "column",
          bgcolor: "#fff",
          borderRight: "1px solid #e8edf3",
        }}
      >
        <Box sx={{ px: 2.25, pt: 2.5, pb: 1.5 }}>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              mb: 2,
            }}
          >
            <Box>
              <Typography
                sx={{ fontSize: 21, fontWeight: 700, letterSpacing: "-.4px" }}
              >
                {sectionTitle}
              </Typography>
              <Typography sx={{ color: "#8a96a5", fontSize: 12.5, mt: 0.25 }}>
                {activeSection === "contacts"
                  ? "Mọi người bạn đã trò chuyện"
                  : activeSection === "groups"
                    ? "Các nhóm của bạn"
                    : "Kết nối thời gian thực"}
              </Typography>
            </Box>
            <Box sx={{ display: "flex", gap: 0.5 }}>
              <Tooltip title="Tạo cuộc trò chuyện mới">
                <IconButton
                  aria-label="Tạo cuộc trò chuyện mới"
                  onClick={() => setCreateDialogOpen(true)}
                  sx={{
                    bgcolor: "#edf4ff",
                    color: "#0866ff",
                    "&:hover": { bgcolor: "#deebff" },
                  }}
                >
                  <AddRoundedIcon />
                </IconButton>
              </Tooltip>
              <Tooltip title="Làm mới danh sách">
                <span>
                  <IconButton
                    aria-label="Làm mới cuộc trò chuyện"
                    onClick={() => void refreshConversations()}
                    disabled={isLoading}
                    sx={{ color: "#63748a" }}
                  >
                    {isLoading ? (
                      <CircularProgress size={20} />
                    ) : (
                      <RefreshRoundedIcon />
                    )}
                  </IconButton>
                </span>
              </Tooltip>
            </Box>
          </Box>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              px: 1.3,
              height: 42,
              borderRadius: 2.5,
              bgcolor: "#f3f5f8",
              color: "#8591a0",
              "&:focus-within": { outline: "2px solid #b9d3ff" },
            }}
          >
            <SearchRoundedIcon sx={{ fontSize: 20, mr: 1 }} />
            <InputBase
              fullWidth
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Tìm kiếm cuộc trò chuyện"
              inputProps={{ "aria-label": "Tìm kiếm cuộc trò chuyện" }}
              sx={{ fontSize: 13.5, color: "#263445" }}
            />
          </Box>
        </Box>

        <Divider sx={{ borderColor: "#f0f2f5" }} />
        <Box sx={{ flex: 1, overflowY: "auto", px: 1, py: 0.75 }}>
          {error && (
            <Alert
              severity="error"
              sx={{ mx: 1, my: 1 }}
              onClose={() => setError("")}
            >
              {error}
            </Alert>
          )}
          {isLoading && conversations.length === 0 ? (
            <Box sx={{ display: "grid", placeItems: "center", py: 5 }}>
              <CircularProgress size={26} aria-label="Đang tải cuộc trò chuyện" />
            </Box>
          ) : visibleConversations.length ? (
            visibleConversations.map((conversation) => {
              const name = getConversationName(conversation, currentUserId);
              const initials = getInitials(name);
              const partner = conversation.members.find(
                (m) => m.userId !== currentUserId,
              );
              const isPartnerOnline =
                conversation.type === "DIRECT" &&
                partner &&
                (onlineUserIds.has(partner.userId) || Boolean(partner.isOnline));

              return (
                <Box
                  key={conversation.id}
                  component="button"
                  type="button"
                  onClick={() => selectConversation(conversation)}
                  aria-label={`Mở cuộc trò chuyện ${name}`}
                  sx={{
                    display: "flex",
                    width: "100%",
                    alignItems: "center",
                    gap: 1.5,
                    px: 1.25,
                    py: 1.35,
                    border: 0,
                    borderRadius: 2.5,
                    textAlign: "left",
                    cursor: "pointer",
                    bgcolor:
                      selectedConversation?.id === conversation.id
                        ? "#eef5ff"
                        : "transparent",
                    "&:hover": {
                      bgcolor:
                        selectedConversation?.id === conversation.id
                          ? "#eef5ff"
                          : "#f7f8fa",
                    },
                  }}
                >
                  <Badge
                    overlap="circular"
                    badgeContent={
                      conversation.type === "GROUP" ? (
                        <GroupsRoundedIcon sx={{ fontSize: 12 }} />
                      ) : null
                    }
                    variant={conversation.type === "GROUP" ? "standard" : "dot"}
                    invisible={
                      conversation.type === "DIRECT" && !isPartnerOnline
                    }
                    anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
                    sx={{
                      "& .MuiBadge-badge":
                        conversation.type === "GROUP"
                          ? {
                              bgcolor: "#eaf2ff",
                              color: "#0866ff",
                              minWidth: 18,
                              height: 18,
                              borderRadius: 5,
                            }
                          : {
                              bgcolor: "#22c55e",
                              boxShadow: "0 0 0 2px #fff",
                            },
                    }}
                  >
                    <Avatar
                      src={getPartnerAvatar(conversation, currentUserId)}
                      sx={{
                        width: 48,
                        height: 48,
                        bgcolor:
                          conversation.type === "GROUP" ? "#7c66d8" : "#5886c6",
                        fontSize: 14,
                        fontWeight: 600,
                      }}
                    >
                      {initials}
                    </Avatar>
                  </Badge>
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 1,
                      }}
                    >
                      <Typography
                        noWrap
                        sx={{ color: "#263445", fontSize: 13.5, fontWeight: 600 }}
                      >
                        {name}
                      </Typography>
                      <Typography
                        sx={{
                          color: "#9aa4b1",
                          whiteSpace: "nowrap",
                          fontSize: 10.5,
                        }}
                      >
                        {new Date(
                          conversation.lastMessageAt || conversation.createdAt,
                        ).toLocaleDateString("vi-VN")}
                      </Typography>
                    </Box>
                    <Typography
                      noWrap
                      sx={{ color: "#7f8c9b", fontSize: 12, mt: 0.45 }}
                    >
                      {conversation.lastMessagePreview ||
                        (conversation.type === "GROUP"
                          ? `${conversation.members.length} thành viên`
                          : "Nhấn để trò chuyện")}
                    </Typography>
                  </Box>
                </Box>
              );
            })
          ) : (
            <Typography
              sx={{
                px: 2,
                py: 4,
                textAlign: "center",
                color: "#8995a3",
                fontSize: 13,
              }}
            >
              {search
                ? "Không tìm thấy cuộc trò chuyện"
                : activeSection === "groups"
                  ? "Bạn chưa tham gia nhóm nào."
                  : "Chưa có cuộc trò chuyện. Nhấn + để bắt đầu."}
            </Typography>
          )}
        </Box>
        <Box sx={{ px: 2, py: 1.25, borderTop: "1px solid #f0f2f5" }}>
          <Typography
            sx={{ color: "#9aa4b1", fontSize: 11, textAlign: "center" }}
          >
            Chatter OTT · Realtime WebSocket
          </Typography>
        </Box>
      </Box>

      {/* Main Content Pane */}
      <Box
        sx={{
          minWidth: 0,
          flex: 1,
          display:
            isFullWidthSection || !isMobile || selectedId !== null
              ? "flex"
              : "none",
          flexDirection: "column",
          bgcolor: "#f7f9fc",
        }}
      >
        {activeSection === "analytics" ? (
          <AnalyticsDashboard isAdmin={Boolean(isSystemAdmin)} />
        ) : activeSection === "admin" && isSystemAdmin ? (
          <AdminManagementPanel currentUserId={currentUserId} />
        ) : selectedConversation ? (
          <>
            {/* Conversation Header */}
            <Box
              sx={{
                height: 68,
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                px: { xs: 1.5, sm: 2.5 },
                gap: 1.5,
                bgcolor: "#fff",
                borderBottom: "1px solid #e9edf2",
              }}
            >
              {isMobile && (
                <IconButton
                  aria-label="Quay lại danh sách"
                  onClick={() => setSelectedId(null)}
                >
                  <ArrowBackRoundedIcon />
                </IconButton>
              )}
              <Avatar
                src={getPartnerAvatar(selectedConversation, currentUserId)}
                sx={{
                  width: 42,
                  height: 42,
                  bgcolor:
                    selectedConversation.type === "GROUP"
                      ? "#7c66d8"
                      : "#5886c6",
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                {getInitials(
                  getConversationName(selectedConversation, currentUserId),
                )}
              </Avatar>
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography
                  noWrap
                  sx={{ color: "#263445", fontSize: 15, fontWeight: 700 }}
                >
                  {getConversationName(selectedConversation, currentUserId)}
                </Typography>
                <Typography sx={{ color: "#7c8a99", fontSize: 12, mt: 0.15 }}>
                  {selectedConversation.type === "GROUP"
                    ? `${selectedConversation.members.length} thành viên · Nhấn (i) để quản lý thành viên`
                    : (() => {
                        const partner = selectedConversation.members.find(
                          (m) => m.userId !== currentUserId,
                        );
                        const online =
                          partner &&
                          (onlineUserIds.has(partner.userId) ||
                            Boolean(partner.isOnline));
                        return online
                          ? "Đang hoạt động trực tuyến"
                          : "Trò chuyện trực tiếp 1-1";
                      })()}
                </Typography>
              </Box>
              <Tooltip title="Thông tin & Quản lý thành viên">
                <IconButton
                  aria-label="Thông tin hội thoại và thành viên"
                  onClick={() => setInfoDrawerOpen(true)}
                  sx={{ color: "#0866ff", bgcolor: "#eef5ff" }}
                >
                  <InfoOutlinedIcon />
                </IconButton>
              </Tooltip>
            </Box>

            <ChatWindow
              conversation={selectedConversation}
              currentUserId={currentUserId}
              canManageGroup={Boolean(canManageSelectedGroup)}
              incomingEventMessage={incomingEventMessage}
              typingUsers={activeTypingUsers}
              onEmitTyping={(convId, isTyping) =>
                realtimeRef.current?.setTyping(convId, isTyping)
              }
              onConversationActivity={() => void refreshConversations()}
            />

            <GroupInfoDrawer
              open={infoDrawerOpen}
              onClose={() => setInfoDrawerOpen(false)}
              conversation={selectedConversation}
              currentUserId={currentUserId}
              onlineUserIds={onlineUserIds}
              onRefresh={refreshConversations}
              onLeftGroup={() => setSelectedId(null)}
            />
          </>
        ) : activeSection === "contacts" ? (
          <ContactsDirectoryPanel
            onlineUserIds={onlineUserIds}
            onOpenDirectChat={handleOpenDirectByUserId}
          />
        ) : (
          <Box
            sx={{
              flex: 1,
              display: "grid",
              placeItems: "center",
              color: "#8c98a7",
              p: 3,
            }}
          >
            <Box sx={{ textAlign: "center", maxWidth: 420 }}>
              <ChatRoundedIcon
                sx={{ fontSize: 52, color: "#0866ff", opacity: 0.75, mb: 1 }}
              />
              <Typography sx={{ fontWeight: 700, fontSize: 17, color: "#2b3a4a" }}>
                Chào mừng đến với Chatter OTT
              </Typography>
              <Typography sx={{ fontSize: 13.5, mt: 0.75, lineHeight: 1.55 }}>
                Chọn một cuộc trò chuyện ở thanh bên trái để gửi tin nhắn văn bản,
                hình ảnh, video, tài liệu và biểu cảm theo thời gian thực.
              </Typography>
            </Box>
          </Box>
        )}
      </Box>

      {/* Create Direct / Group Dialog */}
      <Dialog
        open={createDialogOpen}
        onClose={resetCreateDialog}
        fullWidth
        maxWidth="sm"
      >
        <Box component="form" onSubmit={createConversation}>
          <DialogTitle sx={{ pb: 1 }}>Tạo cuộc trò chuyện</DialogTitle>
          <DialogContent>
            <Box sx={{ display: "flex", gap: 1, mb: 2 }}>
              <Button
                type="button"
                aria-label="Chuyển sang chat riêng"
                variant={createMode === "direct" ? "contained" : "outlined"}
                onClick={() => {
                  setCreateMode("direct");
                  setError("");
                }}
              >
                Chat riêng
              </Button>
              <Button
                type="button"
                aria-label="Chuyển sang tạo nhóm"
                variant={createMode === "group" ? "contained" : "outlined"}
                onClick={() => {
                  setCreateMode("group");
                  setError("");
                }}
              >
                Tạo nhóm
              </Button>
            </Box>
            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}
            {createMode === "group" && (
              <TextField
                autoFocus
                fullWidth
                label="Tên nhóm"
                value={groupTitle}
                onChange={(event) => setGroupTitle(event.target.value)}
                slotProps={{
                  htmlInput: { maxLength: 80, "aria-label": "Tên nhóm" },
                }}
                sx={{ mb: 2 }}
                required
              />
            )}
            <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
              <TextField
                fullWidth
                autoFocus={createMode === "direct"}
                type="email"
                label="Email người dùng"
                value={recipientEmail}
                onChange={(event) => setRecipientEmail(event.target.value)}
                slotProps={{ htmlInput: { maxLength: 254 } }}
                onKeyDown={(event) => {
                  if (createMode === "group" && event.key === "Enter") {
                    event.preventDefault();
                    void addSelectedMember();
                  }
                }}
              />
              {createMode === "group" && (
                <Button
                  type="button"
                  variant="outlined"
                  onClick={() => void addSelectedMember()}
                  disabled={!recipientEmail.trim() || isSubmitting}
                  sx={{ minHeight: 56, whiteSpace: "nowrap" }}
                >
                  Thêm
                </Button>
              )}
            </Box>
            {selectedMembers.length > 0 && (
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mt: 2 }}>
                {selectedMembers.map((member) => (
                  <Chip
                    key={member.id}
                    label={member.displayName}
                    onDelete={() =>
                      setSelectedMembers((members) =>
                        members.filter((item) => item.id !== member.id),
                      )
                    }
                  />
                ))}
              </Box>
            )}
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2.5 }}>
            <Button onClick={resetCreateDialog} color="inherit">
              Hủy
            </Button>
            <Button
              type="submit"
              variant="contained"
              aria-label={createMode === "direct" ? "Mở chat" : "Tạo nhóm ngay"}
              startIcon={
                isSubmitting ? (
                  <CircularProgress size={18} color="inherit" />
                ) : (
                  <PersonAddAltRoundedIcon />
                )
              }
              disabled={
                isSubmitting ||
                (createMode === "direct" && !recipientEmail.trim()) ||
                (createMode === "group" &&
                  (!groupTitle.trim() || selectedMembers.length === 0))
              }
            >
              {createMode === "direct" ? "Mở chat" : "Tạo nhóm"}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>

      {/* Profile & Password Dialog */}
      {currentUser && (
        <ProfileDialog
          open={profileDialogOpen}
          onClose={() => setProfileDialogOpen(false)}
          profile={currentUser}
          onProfileUpdated={(updated) => onUserUpdated?.(updated)}
        />
      )}
    </Box>
  );
};

export default Dashboard;
