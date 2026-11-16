import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Avatar,
  Box,
  Badge,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputBase,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
} from "@mui/material";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
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

interface ConversationMember {
  userId: string;
  displayName: string;
  role: "OWNER" | "ADMIN" | "MEMBER";
}

interface Conversation {
  id: string;
  type: "DIRECT" | "GROUP";
  title?: string | null;
  createdBy: string;
  createdAt: string;
  members: ConversationMember[];
}

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

const getInitials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toLocaleUpperCase("vi");

type Section = "messages" | "contacts" | "groups";

const Dashboard = ({
  onLogout,
  currentUserId,
}: {
  onLogout?: () => void;
  currentUserId: string;
}) => {
  const isMobile = useMediaQuery("(max-width:760px)");
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

  const refreshConversations = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await graphqlRequest<{ myConversations: Conversation[] }>(
        `query MyConversations {
          myConversations {
            id type title createdBy createdAt
            members { userId displayName role }
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

  const navItems = [
    { id: "messages" as const, label: "Tin nhắn", icon: <ChatRoundedIcon /> },
    { id: "contacts" as const, label: "Danh bạ", icon: <PeopleAltRoundedIcon /> },
    { id: "groups" as const, label: "Nhóm", icon: <GroupsRoundedIcon /> },
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
  const showConversationList = !isMobile || selectedId === null;
  const sectionTitle =
    activeSection === "contacts"
      ? "Danh bạ"
      : activeSection === "groups"
        ? "Nhóm"
        : "Tin nhắn";

  const selectConversation = (conversation: Conversation) => {
    setSelectedId(conversation.id);
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
    if (!data.userByEmail) throw new Error("Không tìm thấy tài khoản đang hoạt động với email này.");
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
            mb: 2,
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
                    ? "rgba(255,255,255,.2)"
                    : "transparent",
                "&:hover": { bgcolor: "rgba(255,255,255,.16)" },
              }}
            >
              {item.icon}
            </IconButton>
          </Tooltip>
        ))}
        <Box sx={{ flex: 1 }} />
        <Tooltip title="Cài đặt" placement="right">
          <IconButton aria-label="Cài đặt" sx={{ color: "white" }}>
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
        <Avatar sx={{ width: 36, height: 36, mb: 1, bgcolor: "#f1b878", fontSize: 14 }}>
          AN
        </Avatar>
      </Box>

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
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 }}>
            <Box>
              <Typography sx={{ fontSize: 21, fontWeight: 700, letterSpacing: "-.4px" }}>
                {sectionTitle}
              </Typography>
              <Typography sx={{ color: "#8a96a5", fontSize: 12.5, mt: 0.25 }}>
                {activeSection === "contacts"
                  ? "Mọi người bạn đã trò chuyện"
                  : activeSection === "groups"
                    ? "Các nhóm của bạn"
                    : "Kết nối với mọi người"}
              </Typography>
            </Box>
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
                  {isLoading ? <CircularProgress size={20} /> : <RefreshRoundedIcon />}
                </IconButton>
              </span>
            </Tooltip>
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
            <Alert severity="error" sx={{ mx: 1, my: 1 }} onClose={() => setError("")}>
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
                  bgcolor: selectedConversation?.id === conversation.id ? "#eef5ff" : "transparent",
                  "&:hover": { bgcolor: selectedConversation?.id === conversation.id ? "#eef5ff" : "#f7f8fa" },
                }}
              >
                <Badge
                  overlap="circular"
                  badgeContent={conversation.type === "GROUP" ? <GroupsRoundedIcon sx={{ fontSize: 12 }} /> : null}
                  invisible={conversation.type !== "GROUP"}
                  sx={{ "& .MuiBadge-badge": { bgcolor: "#eaf2ff", color: "#0866ff", minWidth: 18, height: 18, borderRadius: 5 } }}
                >
                  <Avatar sx={{ width: 48, height: 48, bgcolor: conversation.type === "GROUP" ? "#7c66d8" : "#5886c6", fontSize: 14, fontWeight: 600 }}>
                    {initials}
                  </Avatar>
                </Badge>
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
                    <Typography noWrap sx={{ color: "#263445", fontSize: 13.5, fontWeight: 600 }}>
                      {name}
                    </Typography>
                    <Typography sx={{ color: "#9aa4b1", whiteSpace: "nowrap", fontSize: 10.5 }}>
                      {new Date(conversation.createdAt).toLocaleDateString("vi-VN")}
                    </Typography>
                  </Box>
                  <Typography noWrap sx={{ color: "#929dab", fontSize: 12, mt: 0.55 }}>
                    {conversation.type === "GROUP" ? `${conversation.members.length} thành viên` : "Chat riêng"}
                  </Typography>
                </Box>
              </Box>
              );
            })
          ) : (
            <Typography sx={{ px: 2, py: 4, textAlign: "center", color: "#8995a3", fontSize: 13 }}>
              {search ? "Không tìm thấy cuộc trò chuyện" : activeSection === "groups" ? "Bạn chưa tham gia nhóm nào." : "Chưa có cuộc trò chuyện. Nhấn + để bắt đầu."}
            </Typography>
          )}
        </Box>
        <Box sx={{ px: 2, py: 1.5, borderTop: "1px solid #f0f2f5" }}>
          <Typography sx={{ color: "#9aa4b1", fontSize: 11, textAlign: "center" }}>
            Chatter · Luôn giữ kết nối
          </Typography>
        </Box>
      </Box>

      <Box
        sx={{
          minWidth: 0,
          flex: 1,
          display: !isMobile || selectedId !== null ? "flex" : "none",
          flexDirection: "column",
          bgcolor: "#f7f9fc",
        }}
      >
        {selectedConversation ? (
          <>
            <Box
              sx={{
                height: 72,
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
                <IconButton aria-label="Quay lại danh sách" onClick={() => setSelectedId(null)}>
                  <ArrowBackRoundedIcon />
                </IconButton>
              )}
              <Avatar sx={{ width: 42, height: 42, bgcolor: selectedConversation.type === "GROUP" ? "#7c66d8" : "#5886c6", fontSize: 13, fontWeight: 600 }}>
                {getInitials(getConversationName(selectedConversation, currentUserId))}
              </Avatar>
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography noWrap sx={{ color: "#263445", fontSize: 14.5, fontWeight: 700 }}>
                  {getConversationName(selectedConversation, currentUserId)}
                </Typography>
                <Typography sx={{ color: "#8b97a5", fontSize: 11.5, mt: 0.25 }}>
                  {selectedConversation.type === "GROUP"
                    ? `${selectedConversation.members.length} thành viên`
                    : "Chat riêng"}
                </Typography>
              </Box>
              <IconButton aria-label="Làm mới cuộc trò chuyện" onClick={() => void refreshConversations()} sx={{ color: "#647386" }}>
                <InfoOutlinedIcon />
              </IconButton>
            </Box>

            <Box
              sx={{
                flex: 1,
                minHeight: 0,
                overflowY: "auto",
                px: { xs: 1.5, sm: 4, md: 7 },
                py: 3,
                display: "flex",
                flexDirection: "column",
                gap: 1.5,
              }}
            >
              <Box sx={{ flex: 1, display: "grid", placeItems: "center", color: "#8c98a7", textAlign: "center" }}>
                <Box>
                  <ChatRoundedIcon sx={{ fontSize: 42, color: "#b7c8df", mb: 1 }} />
                  <Typography sx={{ fontWeight: 600, fontSize: 14 }}>
                    {selectedConversation.type === "GROUP" ? "Nhóm đã sẵn sàng" : "Cuộc trò chuyện đã sẵn sàng"}
                  </Typography>
                  <Typography sx={{ fontSize: 12.5, mt: 0.5 }}>
                    Tính năng gửi tin nhắn sẽ được kết nối ở bước tiếp theo.
                  </Typography>
                  {selectedConversation.type === "GROUP" && (
                    <Box sx={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 1, mt: 2 }}>
                      {selectedConversation.members.map((member) => (
                        <Chip
                          key={member.userId}
                          avatar={<Avatar>{getInitials(member.displayName)}</Avatar>}
                          label={`${member.displayName}${member.role === "OWNER" ? " · Chủ nhóm" : member.role === "ADMIN" ? " · Quản trị viên" : ""}`}
                          size="small"
                        />
                      ))}
                    </Box>
                  )}
                </Box>
              </Box>
            </Box>
          </>
        ) : (
          <Box sx={{ flex: 1, display: "grid", placeItems: "center", color: "#8c98a7" }}>
            <Box sx={{ textAlign: "center" }}>
              <ChatRoundedIcon sx={{ fontSize: 48, color: "#b7c8df", mb: 1 }} />
              <Typography sx={{ fontWeight: 600 }}>Chọn một cuộc trò chuyện</Typography>
              <Typography sx={{ fontSize: 13, mt: 0.5 }}>Tin nhắn của bạn sẽ xuất hiện ở đây.</Typography>
            </Box>
          </Box>
        )}
      </Box>

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
              <Button type="button" aria-label="Chuyển sang chat riêng" variant={createMode === "direct" ? "contained" : "outlined"} onClick={() => { setCreateMode("direct"); setError(""); }}>
                Chat riêng
              </Button>
              <Button type="button" aria-label="Chuyển sang tạo nhóm" variant={createMode === "group" ? "contained" : "outlined"} onClick={() => { setCreateMode("group"); setError(""); }}>
                Tạo nhóm
              </Button>
            </Box>
            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
            {createMode === "group" && (
              <TextField
                autoFocus
                fullWidth
                label="Tên nhóm"
                value={groupTitle}
                onChange={(event) => setGroupTitle(event.target.value)}
                slotProps={{ htmlInput: { maxLength: 80, "aria-label": "Tên nhóm" } }}
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
                    onDelete={() => setSelectedMembers((members) => members.filter((item) => item.id !== member.id))}
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
              startIcon={isSubmitting ? <CircularProgress size={18} color="inherit" /> : <PersonAddAltRoundedIcon />}
              disabled={
                isSubmitting ||
                (createMode === "direct" && !recipientEmail.trim()) ||
                (createMode === "group" && (!groupTitle.trim() || selectedMembers.length === 0))
              }
            >
              {createMode === "direct" ? "Mở chat" : "Tạo nhóm"}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>
    </Box>
  );
};

export default Dashboard;
