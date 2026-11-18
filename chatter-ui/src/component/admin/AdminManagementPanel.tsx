import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  InputBase,
  Paper,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  Typography,
} from "@mui/material";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import { graphqlRequest } from "../../services/graphql";
import {
  Conversation,
  CurrentUserProfile,
  getInitials,
  GraphQLUserRole,
  GraphQLUserStatus,
} from "../../types/chat";

interface AdminUserRow extends CurrentUserProfile {
  createdAt: string;
}

const AdminManagementPanel: React.FC<{ currentUserId: string }> = ({
  currentUserId,
}) => {
  const [tab, setTab] = useState<0 | 1>(0);
  const [search, setSearch] = useState("");
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const loadAdminData = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const [usersRes, convsRes] = await Promise.all([
        graphqlRequest<{ adminUsers: AdminUserRow[] }>(
          `query AdminUsers($search: String) {
            adminUsers(search: $search, limit: 100) {
              id email displayName avatarUrl status role lastSeenAt createdAt
            }
          }`,
          { search: search.trim() || undefined },
        ),
        graphqlRequest<{ adminConversations: Conversation[] }>(
          `query AdminConvs($search: String) {
            adminConversations(search: $search, includeClosed: true, limit: 100) {
              id type title createdBy createdAt lastMessageAt closedAt memberCount
            }
          }`,
          { search: search.trim() || undefined },
        ),
      ]);
      setUsers(usersRes.adminUsers);
      setConversations(convsRes.adminConversations);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Không thể tải dữ liệu quản trị hệ thống.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadAdminData();
    }, 220);
    return () => clearTimeout(timer);
  }, [loadAdminData]);

  const handleToggleUserStatus = async (
    userId: string,
    nextStatus: GraphQLUserStatus,
  ) => {
    setBusyId(userId);
    setError("");
    try {
      await graphqlRequest(
        `mutation SetStatus($userId: String!, $status: UserStatus!) {
          adminSetUserStatus(userId: $userId, status: $status) { id status }
        }`,
        { userId, status: nextStatus },
      );
      await loadAdminData();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Không thể cập nhật trạng thái tài khoản.",
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleToggleUserRole = async (
    userId: string,
    nextRole: GraphQLUserRole,
  ) => {
    setBusyId(userId);
    setError("");
    try {
      await graphqlRequest(
        `mutation SetRole($userId: String!, $role: UserRole!) {
          adminSetUserRole(userId: $userId, role: $role) { id role }
        }`,
        { userId, role: nextRole },
      );
      await loadAdminData();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Không thể cập nhật quyền hệ thống.",
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleToggleConversationClosed = async (
    conversationId: string,
    closed: boolean,
  ) => {
    setBusyId(conversationId);
    setError("");
    try {
      await graphqlRequest(
        `mutation SetConvClosed($conversationId: String!, $closed: Boolean!) {
          adminSetConversationClosed(conversationId: $conversationId, closed: $closed) {
            id closedAt
          }
        }`,
        { conversationId, closed },
      );
      await loadAdminData();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Không thể cập nhật trạng thái nhóm/hội thoại.",
      );
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Box sx={{ flex: 1, overflowY: "auto", p: { xs: 2, sm: 3.5 }, bgcolor: "#f4f7fb" }}>
      <Box sx={{ maxWidth: 1120, mx: "auto" }}>
        <Typography sx={{ fontSize: 22, fontWeight: 800, mb: 0.5 }}>
          Quản trị Hệ thống (Tài khoản & Nhóm)
        </Typography>
        <Typography sx={{ fontSize: 13.5, color: "#68778a", mb: 2.5 }}>
          Quản lý trạng thái hoạt động của tài khoản, phân quyền Admin và kiểm soát nhóm trò chuyện.
        </Typography>

        <Paper
          elevation={0}
          sx={{
            display: "flex",
            alignItems: "center",
            px: 2,
            height: 44,
            borderRadius: 2.5,
            border: "1px solid #dde5ef",
            bgcolor: "#fff",
            mb: 2.5,
          }}
        >
          <SearchRoundedIcon sx={{ color: "#79889b", mr: 1 }} />
          <InputBase
            fullWidth
            placeholder="Tìm kiếm tài khoản (email/tên) hoặc tên nhóm..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </Paper>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>
            {error}
          </Alert>
        )}

        <Paper
          elevation={0}
          sx={{ borderRadius: 3, border: "1px solid #e5ecf4", overflow: "hidden" }}
        >
          <Tabs
            value={tab}
            onChange={(_, v) => setTab(v)}
            sx={{ px: 2, borderBottom: "1px solid #e8eef5" }}
          >
            <Tab label={`Tài khoản (${users.length})`} />
            <Tab label={`Nhóm & Hội thoại (${conversations.length})`} />
          </Tabs>

          {isLoading ? (
            <Box sx={{ display: "grid", placeItems: "center", py: 6 }}>
              <CircularProgress size={28} />
            </Box>
          ) : tab === 0 ? (
            <Box sx={{ overflowX: "auto" }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Người dùng</TableCell>
                    <TableCell>Email</TableCell>
                    <TableCell>Vai trò</TableCell>
                    <TableCell>Trạng thái</TableCell>
                    <TableCell align="right">Thao tác quản trị</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {users.map((u) => {
                    const isSelf = u.id === currentUserId;
                    return (
                      <TableRow key={u.id}>
                        <TableCell>
                          <Stack direction="row" spacing={1.25} sx={{ alignItems: "center" }}>
                            <Avatar
                              src={u.avatarUrl || undefined}
                              sx={{ width: 32, height: 32, fontSize: 12, bgcolor: "#0866ff" }}
                            >
                              {getInitials(u.displayName)}
                            </Avatar>
                            <Typography sx={{ fontSize: 13.5, fontWeight: 600 }}>
                              {u.displayName} {isSelf ? "(Bạn)" : ""}
                            </Typography>
                          </Stack>
                        </TableCell>
                        <TableCell>{u.email}</TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            color={u.role === "ADMIN" ? "primary" : "default"}
                            label={u.role}
                          />
                        </TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            color={u.status === "ACTIVE" ? "success" : "error"}
                            label={
                              u.status === "ACTIVE" ? "Hoạt động" : "Vô hiệu hóa"
                            }
                          />
                        </TableCell>
                        <TableCell align="right">
                          <Stack
                            direction="row"
                            spacing={1}
                            sx={{ justifyContent: "flex-end" }}
                          >
                            <Button
                              size="small"
                              variant="outlined"
                              disabled={isSelf || busyId === u.id}
                              onClick={() =>
                                void handleToggleUserRole(
                                  u.id,
                                  u.role === "ADMIN" ? "USER" : "ADMIN",
                                )
                              }
                            >
                              {u.role === "ADMIN" ? "Hạ xuống User" : "Cấp quyền Admin"}
                            </Button>
                            <Button
                              size="small"
                              variant="contained"
                              color={u.status === "ACTIVE" ? "error" : "success"}
                              disabled={isSelf || busyId === u.id}
                              onClick={() =>
                                void handleToggleUserStatus(
                                  u.id,
                                  u.status === "ACTIVE" ? "DISABLED" : "ACTIVE",
                                )
                              }
                            >
                              {u.status === "ACTIVE" ? "Khóa tài khoản" : "Mở khóa"}
                            </Button>
                          </Stack>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Box>
          ) : (
            <Box sx={{ overflowX: "auto" }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Tên nhóm / Hội thoại</TableCell>
                    <TableCell>Phân loại</TableCell>
                    <TableCell align="right">Thành viên</TableCell>
                    <TableCell>Trạng thái</TableCell>
                    <TableCell align="right">Thao tác</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {conversations.map((c) => {
                    const isClosed = Boolean(c.closedAt);
                    return (
                      <TableRow key={c.id}>
                        <TableCell sx={{ fontWeight: 600 }}>
                          {c.type === "GROUP"
                            ? c.title || "Nhóm chưa đặt tên"
                            : `Chat riêng (${c.id.slice(-6)})`}
                        </TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            label={c.type === "GROUP" ? "Nhóm" : "1-1"}
                          />
                        </TableCell>
                        <TableCell align="right">{c.memberCount ?? "-"}</TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            color={isClosed ? "warning" : "success"}
                            label={isClosed ? "Đã đóng" : "Đang mở"}
                          />
                        </TableCell>
                        <TableCell align="right">
                          <Button
                            size="small"
                            variant="outlined"
                            color={isClosed ? "success" : "warning"}
                            disabled={busyId === c.id}
                            onClick={() =>
                              void handleToggleConversationClosed(c.id, !isClosed)
                            }
                          >
                            {isClosed ? "Mở lại" : "Đóng hội thoại"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Box>
          )}
        </Paper>
      </Box>
    </Box>
  );
};

export default AdminManagementPanel;
