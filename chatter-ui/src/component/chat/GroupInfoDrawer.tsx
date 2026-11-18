import React, { useEffect, useState } from "react";
import {
  Alert,
  Avatar,
  Badge,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Drawer,
  IconButton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AdminPanelSettingsOutlinedIcon from "@mui/icons-material/AdminPanelSettingsOutlined";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import ExitToAppRoundedIcon from "@mui/icons-material/ExitToAppRounded";
import PersonAddAltRoundedIcon from "@mui/icons-material/PersonAddAltRounded";
import PersonRemoveOutlinedIcon from "@mui/icons-material/PersonRemoveOutlined";
import SwapHorizRoundedIcon from "@mui/icons-material/SwapHorizRounded";
import { graphqlRequest } from "../../services/graphql";
import {
  Conversation,
  DirectoryUser,
  getInitials,
} from "../../types/chat";

interface GroupInfoDrawerProps {
  open: boolean;
  onClose: () => void;
  conversation: Conversation;
  currentUserId: string;
  onlineUserIds: Set<string>;
  onRefresh: () => Promise<void>;
  onLeftGroup: () => void;
}

const roleLabel = (role: Conversation["members"][number]["role"]) => {
  if (role === "OWNER") return "Chủ nhóm";
  if (role === "ADMIN") return "Quản trị viên";
  return "Thành viên";
};

const GroupInfoDrawer: React.FC<GroupInfoDrawerProps> = ({
  open,
  onClose,
  conversation,
  currentUserId,
  onlineUserIds,
  onRefresh,
  onLeftGroup,
}) => {
  const myMember = conversation.members.find((m) => m.userId === currentUserId);
  const isOwner = myMember?.role === "OWNER";
  const isManager = isOwner || myMember?.role === "ADMIN";

  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(conversation.title || "");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<DirectoryUser[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    setTitleDraft(conversation.title || "");
    setEditingTitle(false);
    setError("");
    setSuccess("");
  }, [conversation.id, conversation.title, open]);

  useEffect(() => {
    if (!open || conversation.type !== "GROUP" || !isManager) return;
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(() => {
      graphqlRequest<{ searchUsers: DirectoryUser[] }>(
        "query SearchUsers($query: String) { searchUsers(query: $query, limit: 8) { id displayName email avatarUrl } }",
        { query: trimmed },
      )
        .then((res) => {
          const existingSet = new Set(conversation.members.map((m) => m.userId));
          setSearchResults(
            res.searchUsers.filter((u) => !existingSet.has(u.id)),
          );
        })
        .catch(() => undefined);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery, open, conversation.type, conversation.members, isManager]);

  const handleSaveTitle = async () => {
    if (!titleDraft.trim()) return;
    setBusy(true);
    setError("");
    try {
      await graphqlRequest(
        "mutation RenameGroup($conversationId: String!, $title: String!) { updateGroupTitle(conversationId: $conversationId, title: $title) { id title } }",
        { conversationId: conversation.id, title: titleDraft.trim() },
      );
      setEditingTitle(false);
      setSuccess("Đã cập nhật tên nhóm.");
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể đổi tên nhóm.");
    } finally {
      setBusy(false);
    }
  };

  const handleAddMember = async (userId: string) => {
    setBusy(true);
    setError("");
    try {
      await graphqlRequest(
        "mutation AddMember($conversationId: String!, $userId: String!) { addGroupMember(conversationId: $conversationId, userId: $userId) { userId } }",
        { conversationId: conversation.id, userId },
      );
      setSearchQuery("");
      setSearchResults([]);
      setSuccess("Đã thêm thành viên vào nhóm.");
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể thêm thành viên.");
    } finally {
      setBusy(false);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    setBusy(true);
    setError("");
    try {
      await graphqlRequest(
        "mutation RemoveMember($conversationId: String!, $userId: String!) { removeGroupMember(conversationId: $conversationId, userId: $userId) { userId } }",
        { conversationId: conversation.id, userId },
      );
      setSuccess("Đã xóa thành viên khỏi nhóm.");
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể xóa thành viên.");
    } finally {
      setBusy(false);
    }
  };

  const handleToggleAdmin = async (userId: string, makeAdmin: boolean) => {
    setBusy(true);
    setError("");
    try {
      await graphqlRequest(
        "mutation SetAdmin($conversationId: String!, $userId: String!, $isAdmin: Boolean!) { setGroupAdmin(conversationId: $conversationId, userId: $userId, isAdmin: $isAdmin) { userId role } }",
        { conversationId: conversation.id, userId, isAdmin: makeAdmin },
      );
      setSuccess(
        makeAdmin ? "Đã bổ nhiệm Quản trị viên." : "Đã gỡ quyền Quản trị viên.",
      );
      await onRefresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Không thể thay đổi quyền.",
      );
    } finally {
      setBusy(false);
    }
  };

  const handleTransferOwnership = async (newOwnerId: string) => {
    setBusy(true);
    setError("");
    try {
      await graphqlRequest(
        "mutation TransferOwner($conversationId: String!, $newOwnerId: String!) { transferGroupOwnership(conversationId: $conversationId, newOwnerId: $newOwnerId) { userId role } }",
        { conversationId: conversation.id, newOwnerId },
      );
      setSuccess("Đã chuyển quyền Chủ nhóm.");
      await onRefresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Không thể chuyển quyền Chủ nhóm.",
      );
    } finally {
      setBusy(false);
    }
  };

  const handleLeaveGroup = async () => {
    setBusy(true);
    setError("");
    try {
      await graphqlRequest(
        "mutation LeaveGroup($conversationId: String!) { leaveGroup(conversationId: $conversationId) { userId } }",
        { conversationId: conversation.id },
      );
      await onRefresh();
      onLeftGroup();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể rời nhóm.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer anchor="right" open={open} onClose={onClose}>
      <Box sx={{ width: { xs: 320, sm: 370 }, p: 2.5, height: "100%", display: "flex", flexDirection: "column" }}>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 }}>
          <Typography sx={{ fontWeight: 700, fontSize: 17 }}>
            {conversation.type === "GROUP" ? "Thông tin nhóm" : "Thông tin hội thoại"}
          </Typography>
          <IconButton size="small" onClick={onClose}>
            <CloseRoundedIcon />
          </IconButton>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 1.5 }} onClose={() => setError("")}>
            {error}
          </Alert>
        )}
        {success && (
          <Alert severity="success" sx={{ mb: 1.5 }} onClose={() => setSuccess("")}>
            {success}
          </Alert>
        )}

        {conversation.type === "GROUP" && (
          <Box sx={{ mb: 2 }}>
            {editingTitle ? (
              <Stack direction="row" spacing={1}>
                <TextField
                  size="small"
                  fullWidth
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  label="Tên nhóm"
                />
                <Button
                  variant="contained"
                  size="small"
                  disabled={busy || !titleDraft.trim()}
                  onClick={() => void handleSaveTitle()}
                >
                  Lưu
                </Button>
              </Stack>
            ) : (
              <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", bgcolor: "#f5f8fc", p: 1.5, borderRadius: 2 }}>
                <Box>
                  <Typography sx={{ fontWeight: 700, fontSize: 15 }}>
                    {conversation.title || "Nhóm chưa đặt tên"}
                  </Typography>
                  <Typography sx={{ fontSize: 12, color: "#6e7d90" }}>
                    {conversation.members.length} thành viên
                  </Typography>
                </Box>
                {isManager && (
                  <Tooltip title="Đổi tên nhóm">
                    <IconButton size="small" onClick={() => setEditingTitle(true)}>
                      <EditOutlinedIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                )}
              </Box>
            )}
          </Box>
        )}

        {conversation.type === "GROUP" && isManager && (
          <Box sx={{ mb: 2 }}>
            <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: "#4c5c70", mb: 0.75 }}>
              Thêm thành viên mới
            </Typography>
            <TextField
              size="small"
              fullWidth
              placeholder="Tìm theo tên hoặc email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchResults.length > 0 && (
              <Stack spacing={0.75} sx={{ mt: 1, maxHeight: 160, overflowY: "auto" }}>
                {searchResults.map((u) => (
                  <Box
                    key={u.id}
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      p: 1,
                      borderRadius: 2,
                      bgcolor: "#f7f9fc",
                    }}
                  >
                    <Box sx={{ minWidth: 0 }}>
                      <Typography noWrap sx={{ fontSize: 13, fontWeight: 600 }}>
                        {u.displayName}
                      </Typography>
                      <Typography noWrap sx={{ fontSize: 11.5, color: "#738296" }}>
                        {u.email}
                      </Typography>
                    </Box>
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<PersonAddAltRoundedIcon />}
                      disabled={busy}
                      onClick={() => void handleAddMember(u.id)}
                    >
                      Thêm
                    </Button>
                  </Box>
                ))}
              </Stack>
            )}
          </Box>
        )}

        <Divider sx={{ mb: 1.5 }} />

        <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: "#4c5c70", mb: 1 }}>
          Danh sách thành viên ({conversation.members.length})
        </Typography>

        <Stack spacing={1} sx={{ flex: 1, overflowY: "auto", pr: 0.5 }}>
          {conversation.members.map((member) => {
            const online =
              onlineUserIds.has(member.userId) || Boolean(member.isOnline);
            const isTargetOwner = member.role === "OWNER";
            const isTargetAdmin = member.role === "ADMIN";
            const isSelf = member.userId === currentUserId;
            const canKick =
              conversation.type === "GROUP" &&
              !isSelf &&
              !isTargetOwner &&
              (isOwner || (isManager && !isTargetAdmin));

            return (
              <Box
                key={member.userId}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1.25,
                  p: 1,
                  borderRadius: 2,
                  bgcolor: "#f8fafd",
                }}
              >
                <Badge
                  overlap="circular"
                  variant="dot"
                  invisible={!online}
                  anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
                  sx={{
                    "& .MuiBadge-badge": {
                      bgcolor: "#22c55e",
                      boxShadow: "0 0 0 2px #fff",
                    },
                  }}
                >
                  <Avatar
                    src={member.avatarUrl || undefined}
                    sx={{ width: 38, height: 38, bgcolor: "#5886c6", fontSize: 13 }}
                  >
                    {getInitials(member.displayName)}
                  </Avatar>
                </Badge>

                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography noWrap sx={{ fontSize: 13.5, fontWeight: 600 }}>
                    {member.displayName} {isSelf ? "(Bạn)" : ""}
                  </Typography>
                  <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", mt: 0.25 }}>
                    <Chip
                      size="small"
                      label={roleLabel(member.role)}
                      color={
                        isTargetOwner
                          ? "primary"
                          : isTargetAdmin
                            ? "secondary"
                            : "default"
                      }
                      sx={{ height: 20, fontSize: 10.5 }}
                    />
                    <Typography sx={{ fontSize: 11, color: online ? "#16a34a" : "#8b97a5" }}>
                      {online ? "Đang hoạt động" : "Ngoại tuyến"}
                    </Typography>
                  </Stack>
                </Box>

                {conversation.type === "GROUP" && !isSelf && (
                  <Stack direction="row" spacing={0.25}>
                    {isOwner && !isTargetOwner && (
                      <Tooltip
                        title={
                          isTargetAdmin
                            ? "Gỡ quyền Quản trị viên"
                            : "Bổ nhiệm Quản trị viên"
                        }
                      >
                        <IconButton
                          size="small"
                          disabled={busy}
                          onClick={() =>
                            void handleToggleAdmin(member.userId, !isTargetAdmin)
                          }
                        >
                          <AdminPanelSettingsOutlinedIcon
                            fontSize="small"
                            color={isTargetAdmin ? "primary" : "inherit"}
                          />
                        </IconButton>
                      </Tooltip>
                    )}

                    {isOwner && !isTargetOwner && (
                      <Tooltip title="Chuyển quyền Chủ nhóm">
                        <IconButton
                          size="small"
                          disabled={busy}
                          onClick={() =>
                            void handleTransferOwnership(member.userId)
                          }
                        >
                          <SwapHorizRoundedIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}

                    {canKick && (
                      <Tooltip title="Mời ra khỏi nhóm">
                        <IconButton
                          size="small"
                          color="error"
                          disabled={busy}
                          onClick={() => void handleRemoveMember(member.userId)}
                        >
                          <PersonRemoveOutlinedIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                  </Stack>
                )}
              </Box>
            );
          })}
        </Stack>

        {conversation.type === "GROUP" && (
          <Box sx={{ pt: 2, borderTop: "1px solid #eef2f6" }}>
            <Tooltip
              title={
                isOwner
                  ? "Hãy chuyển quyền Chủ nhóm cho thành viên khác trước khi rời nhóm"
                  : ""
              }
            >
              <span>
                <Button
                  fullWidth
                  color="error"
                  variant="outlined"
                  startIcon={
                    busy ? <CircularProgress size={16} /> : <ExitToAppRoundedIcon />
                  }
                  disabled={busy || isOwner}
                  onClick={() => void handleLeaveGroup()}
                >
                  Rời khỏi nhóm
                </Button>
              </span>
            </Tooltip>
          </Box>
        )}
      </Box>
    </Drawer>
  );
};

export default GroupInfoDrawer;
