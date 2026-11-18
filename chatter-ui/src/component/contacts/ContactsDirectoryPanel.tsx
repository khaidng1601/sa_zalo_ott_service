import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Avatar,
  Badge,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  InputBase,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import ChatBubbleOutlineRoundedIcon from "@mui/icons-material/ChatBubbleOutlineRounded";
import PersonAddAlt1RoundedIcon from "@mui/icons-material/PersonAddAlt1Rounded";
import PersonRemoveAlt1RoundedIcon from "@mui/icons-material/PersonRemoveAlt1Rounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import { graphqlRequest } from "../../services/graphql";
import { DirectoryUser, getInitials } from "../../types/chat";

interface ContactsDirectoryPanelProps {
  onlineUserIds: Set<string>;
  onOpenDirectChat: (userId: string) => Promise<void>;
}

const ContactsDirectoryPanel: React.FC<ContactsDirectoryPanelProps> = ({
  onlineUserIds,
  onOpenDirectChat,
}) => {
  const [contacts, setContacts] = useState<DirectoryUser[]>([]);
  const [directory, setDirectory] = useState<DirectoryUser[]>([]);
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const loadData = useCallback(async (searchText: string) => {
    setIsLoading(true);
    try {
      const [contactsRes, searchRes] = await Promise.all([
        graphqlRequest<{ myContacts: DirectoryUser[] }>(
          "query MyContacts { myContacts { id displayName email avatarUrl lastSeenAt isContact } }",
        ),
        graphqlRequest<{ searchUsers: DirectoryUser[] }>(
          "query SearchUsers($query: String) { searchUsers(query: $query, limit: 30) { id displayName email avatarUrl lastSeenAt isContact } }",
          { query: searchText || undefined },
        ),
      ]);
      setContacts(contactsRes.myContacts ?? []);
      setDirectory(searchRes.searchUsers ?? []);
      setError("");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Không thể tải danh bạ người dùng.",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadData(query.trim());
    }, 220);
    return () => clearTimeout(timer);
  }, [query, loadData]);

  const handleToggleContact = async (user: DirectoryUser) => {
    setBusyUserId(user.id);
    setError("");
    try {
      if (user.isContact) {
        await graphqlRequest(
          "mutation RemoveContact($userId: String!) { removeContact(userId: $userId) }",
          { userId: user.id },
        );
      } else {
        await graphqlRequest(
          "mutation AddContact($userId: String!) { addContact(userId: $userId) { id } }",
          { userId: user.id },
        );
      }
      await loadData(query.trim());
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Không thể cập nhật danh bạ.",
      );
    } finally {
      setBusyUserId(null);
    }
  };

  const renderUserCard = (user: DirectoryUser) => {
    const online = onlineUserIds.has(user.id);
    return (
      <Paper
        key={user.id}
        elevation={0}
        sx={{
          p: 1.75,
          borderRadius: 2.5,
          border: "1px solid #e6ecf3",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 1.5,
          bgcolor: "#fff",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, minWidth: 0 }}>
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
              src={user.avatarUrl || undefined}
              sx={{ width: 44, height: 44, bgcolor: "#0866ff", fontWeight: 600 }}
            >
              {getInitials(user.displayName)}
            </Avatar>
          </Badge>
          <Box sx={{ minWidth: 0 }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
              <Typography noWrap sx={{ fontWeight: 700, fontSize: 14.5 }}>
                {user.displayName}
              </Typography>
              {online && (
                <Chip
                  size="small"
                  label="Online"
                  color="success"
                  sx={{ height: 20, fontSize: 10.5 }}
                />
              )}
            </Stack>
            <Typography noWrap sx={{ fontSize: 12.5, color: "#6d7c90" }}>
              {user.email}
            </Typography>
          </Box>
        </Box>

        <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
          <Button
            size="small"
            variant={user.isContact ? "outlined" : "text"}
            color={user.isContact ? "inherit" : "primary"}
            disabled={busyUserId === user.id}
            startIcon={
              user.isContact ? (
                <PersonRemoveAlt1RoundedIcon fontSize="small" />
              ) : (
                <PersonAddAlt1RoundedIcon fontSize="small" />
              )
            }
            onClick={() => void handleToggleContact(user)}
          >
            {user.isContact ? "Bỏ lưu" : "Lưu danh bạ"}
          </Button>
          <Button
            size="small"
            variant="contained"
            startIcon={<ChatBubbleOutlineRoundedIcon fontSize="small" />}
            onClick={() => void onOpenDirectChat(user.id)}
            sx={{ bgcolor: "#0866ff" }}
          >
            Nhắn tin
          </Button>
        </Stack>
      </Paper>
    );
  };

  return (
    <Box sx={{ flex: 1, overflowY: "auto", p: { xs: 2, sm: 3.5 } }}>
      <Box sx={{ maxWidth: 840, mx: "auto" }}>
        <Typography sx={{ fontSize: 22, fontWeight: 700, mb: 0.5 }}>
          Danh bạ & Tìm kiếm bạn bè
        </Typography>
        <Typography sx={{ fontSize: 13.5, color: "#68778a", mb: 2.5 }}>
          Quản lý danh sách liên hệ đã lưu hoặc tìm kiếm người dùng toàn hệ thống để bắt đầu trò chuyện.
        </Typography>

        <Paper
          elevation={0}
          sx={{
            display: "flex",
            alignItems: "center",
            px: 2,
            height: 46,
            borderRadius: 2.5,
            border: "1px solid #dde5ef",
            bgcolor: "#fff",
            mb: 3,
          }}
        >
          <SearchRoundedIcon sx={{ color: "#79889b", mr: 1 }} />
          <InputBase
            fullWidth
            placeholder="Nhập tên hiển thị hoặc địa chỉ email để tìm người dùng..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </Paper>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>
            {error}
          </Alert>
        )}

        {isLoading ? (
          <Box sx={{ display: "grid", placeItems: "center", py: 6 }}>
            <CircularProgress size={28} />
          </Box>
        ) : (
          <Stack spacing={3}>
            {!query.trim() && (
              <Box>
                <Typography sx={{ fontWeight: 700, fontSize: 15, mb: 1.5 }}>
                  Bạn bè / Liên hệ đã lưu ({contacts.length})
                </Typography>
                {contacts.length > 0 ? (
                  <Stack spacing={1.25}>{contacts.map(renderUserCard)}</Stack>
                ) : (
                  <Typography sx={{ fontSize: 13, color: "#808e9f" }}>
                    Chưa có liên hệ nào được lưu. Bạn có thể lưu từ danh sách gợi ý bên dưới.
                  </Typography>
                )}
              </Box>
            )}

            <Divider />

            <Box>
              <Typography sx={{ fontWeight: 700, fontSize: 15, mb: 1.5 }}>
                {query.trim()
                  ? `Kết quả tìm kiếm (${directory.length})`
                  : `Danh mục người dùng đang hoạt động (${directory.length})`}
              </Typography>
              {directory.length > 0 ? (
                <Stack spacing={1.25}>{directory.map(renderUserCard)}</Stack>
              ) : (
                <Typography sx={{ fontSize: 13, color: "#808e9f" }}>
                  Không tìm thấy người dùng phù hợp.
                </Typography>
              )}
            </Box>
          </Stack>
        )}
      </Box>
    </Box>
  );
};

export default ContactsDirectoryPanel;
