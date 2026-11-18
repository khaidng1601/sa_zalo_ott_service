import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  ButtonGroup,
  Chip,
  CircularProgress,
  LinearProgress,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import { graphqlRequest } from "../../services/graphql";
import { formatFileSize } from "../../services/uploads";

interface MessageKindCount {
  kind: string;
  count: number;
}

interface MediaUsageByKind {
  kind: string;
  count: number;
  totalBytes: number;
}

interface DailyActivityPoint {
  date: string;
  activeUsers: number;
  newAccounts: number;
  messagesSent: number;
  filesUploaded: number;
  reactionsAdded: number;
}

interface ActiveGroupStat {
  conversationId: string;
  title: string;
  memberCount: number;
  messageCount: number;
}

interface ActivityStatsData {
  from: string;
  to: string;
  totalAccounts: number;
  activeAccountsTotal: number;
  disabledAccountsTotal: number;
  dau: number;
  mau: number;
  activeUsersInRange: number;
  newAccountsInRange: number;
  totalGroups: number;
  newGroupsInRange: number;
  activeGroupsInRange: number;
  totalMessagesInRange: number;
  recalledMessagesInRange: number;
  reactionsInRange: number;
  groupMembersAddedInRange: number;
  groupMembersRemovedInRange: number;
  totalStorageBytes: number;
  messagesByKind: MessageKindCount[];
  mediaUsageByKind: MediaUsageByKind[];
  dailySeries: DailyActivityPoint[];
  topActiveGroups: ActiveGroupStat[];
}

interface MyActivitySummaryData {
  days: number;
  messagesSent: number;
  reactionsAdded: number;
  filesUploaded: number;
  totalUploadedBytes: number;
  groupsJoined: number;
  directChatsCount: number;
  messagesByKind: MessageKindCount[];
}

const KIND_LABELS: Record<string, { label: string; color: string }> = {
  text: { label: "Văn bản (Text)", color: "#0866ff" },
  image: { label: "Hình ảnh (Image)", color: "#10b981" },
  video: { label: "Video", color: "#8b5cf6" },
  document: { label: "Tài liệu (Document)", color: "#f59e0b" },
  emotion: { label: "Biểu cảm / Sticker", color: "#ec4899" },
};

const AnalyticsDashboard: React.FC<{ isAdmin: boolean }> = ({ isAdmin }) => {
  const [days, setDays] = useState<number>(7);
  const [systemStats, setSystemStats] = useState<ActivityStatsData | null>(null);
  const [myStats, setMyStats] = useState<MyActivitySummaryData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const loadAnalytics = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      if (isAdmin) {
        const res = await graphqlRequest<{ activityStats: ActivityStatsData }>(
          `query SystemAnalytics($days: Int) {
            activityStats(days: $days) {
              from to
              totalAccounts activeAccountsTotal disabledAccountsTotal
              dau mau activeUsersInRange newAccountsInRange
              totalGroups newGroupsInRange activeGroupsInRange
              totalMessagesInRange recalledMessagesInRange reactionsInRange
              groupMembersAddedInRange groupMembersRemovedInRange
              totalStorageBytes
              messagesByKind { kind count }
              mediaUsageByKind { kind count totalBytes }
              dailySeries { date activeUsers newAccounts messagesSent filesUploaded reactionsAdded }
              topActiveGroups { conversationId title memberCount messageCount }
            }
          }`,
          { days },
        );
        setSystemStats(res.activityStats);
      } else {
        const res = await graphqlRequest<{
          myActivitySummary: MyActivitySummaryData;
        }>(
          `query MySummary($days: Int) {
            myActivitySummary(days: $days) {
              days messagesSent reactionsAdded filesUploaded totalUploadedBytes
              groupsJoined directChatsCount
              messagesByKind { kind count }
            }
          }`,
          { days },
        );
        setMyStats(res.myActivitySummary);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Không thể tải dữ liệu thống kê.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [days, isAdmin]);

  useEffect(() => {
    void loadAnalytics();
  }, [loadAnalytics]);

  const kpiCard = (
    title: string,
    value: string | number,
    subtitle: string,
    accent = "#0866ff",
  ) => (
    <Paper
      elevation={0}
      sx={{
        p: 2.25,
        borderRadius: 3,
        border: "1px solid #e5ecf4",
        bgcolor: "#fff",
        borderTop: `4px solid ${accent}`,
      }}
    >
      <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: "#68778a" }}>
        {title}
      </Typography>
      <Typography sx={{ fontSize: 26, fontWeight: 800, color: "#1d2939", my: 0.5 }}>
        {value}
      </Typography>
      <Typography sx={{ fontSize: 12, color: "#7b899b" }}>{subtitle}</Typography>
    </Paper>
  );

  return (
    <Box sx={{ flex: 1, overflowY: "auto", p: { xs: 2, sm: 3.5 }, bgcolor: "#f4f7fb" }}>
      <Box sx={{ maxWidth: 1120, mx: "auto" }}>
        <Box
          sx={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 2,
            mb: 3,
          }}
        >
          <Box>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
              <Typography sx={{ fontSize: 22, fontWeight: 800 }}>
                {isAdmin
                  ? "Thống kê hoạt động toàn hệ thống"
                  : "Thống kê hoạt động cá nhân"}
              </Typography>
              <Chip
                size="small"
                color={isAdmin ? "primary" : "default"}
                label={isAdmin ? "Admin Analytics" : "Personal"}
              />
            </Stack>
            <Typography sx={{ fontSize: 13.5, color: "#68778a", mt: 0.4 }}>
              Tổng hợp dữ liệu thời gian thực từ MongoDB (không lưu nội dung tin nhắn riêng tư).
            </Typography>
          </Box>

          <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
            <ButtonGroup size="small" variant="outlined" sx={{ bgcolor: "#fff" }}>
              {[7, 14, 30].map((d) => (
                <Button
                  key={d}
                  variant={days === d ? "contained" : "outlined"}
                  onClick={() => setDays(d)}
                >
                  {d} ngày
                </Button>
              ))}
            </ButtonGroup>
            <Button
              size="small"
              variant="outlined"
              startIcon={<RefreshRoundedIcon />}
              onClick={() => void loadAnalytics()}
              sx={{ bgcolor: "#fff" }}
            >
              Làm mới
            </Button>
          </Stack>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 2.5 }} onClose={() => setError("")}>
            {error}
          </Alert>
        )}

        {isLoading ? (
          <Box sx={{ display: "grid", placeItems: "center", py: 8 }}>
            <CircularProgress />
          </Box>
        ) : isAdmin && systemStats ? (
          <Stack spacing={3}>
            {/* KPI Grid */}
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: {
                  xs: "1fr",
                  sm: "repeat(2, 1fr)",
                  lg: "repeat(4, 1fr)",
                },
                gap: 2,
              }}
            >
              {kpiCard(
                "TỔNG TÀI KHOẢN",
                systemStats.totalAccounts,
                `${systemStats.activeAccountsTotal} hoạt động · ${systemStats.disabledAccountsTotal} vô hiệu hóa · +${systemStats.newAccountsInRange} mới`,
                "#0866ff",
              )}
              {kpiCard(
                "NGƯỜI DÙNG HOẠT ĐỘNG (DAU / MAU)",
                `${systemStats.dau} / ${systemStats.mau}`,
                `${systemStats.activeUsersInRange} user hoạt động trong ${days} ngày qua`,
                "#10b981",
              )}
              {kpiCard(
                "TIN NHẮN TRONG KỲ",
                systemStats.totalMessagesInRange,
                `${systemStats.reactionsInRange} lượt thả cảm xúc · ${systemStats.recalledMessagesInRange} thu hồi`,
                "#8b5cf6",
              )}
              {kpiCard(
                "NHÓM & DUNG LƯỢNG MEDIA",
                `${systemStats.activeGroupsInRange}/${systemStats.totalGroups} nhóm`,
                `+${systemStats.newGroupsInRange} nhóm mới · Lưu trữ ${formatFileSize(systemStats.totalStorageBytes)}`,
                "#f59e0b",
              )}
            </Box>

            {/* Daily Bar Chart + Payload Breakdown */}
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", lg: "1.5fr 1fr" },
                gap: 2.5,
              }}
            >
              <Paper
                elevation={0}
                sx={{ p: 2.5, borderRadius: 3, border: "1px solid #e5ecf4" }}
              >
                <Typography sx={{ fontWeight: 700, fontSize: 15.5, mb: 0.5 }}>
                  Biểu đồ hoạt động theo ngày ({days} ngày gần nhất)
                </Typography>
                <Typography sx={{ fontSize: 12, color: "#728194", mb: 2.5 }}>
                   Cột xanh dương: Tin nhắn gửi · Cột xanh lá: Tài khoản hoạt động
                </Typography>

                {(() => {
                  const series = systemStats.dailySeries.slice(-14);
                  const maxVal = Math.max(
                    1,
                    ...series.map((d) => Math.max(d.messagesSent, d.activeUsers)),
                  );
                  return (
                    <Box
                      sx={{
                        display: "grid",
                        gridTemplateColumns: `repeat(${Math.max(series.length, 1)}, minmax(0, 1fr))`,
                        gap: 1,
                        alignItems: "end",
                        height: 190,
                        pt: 2,
                        borderBottom: "1px solid #e8eef5",
                      }}
                    >
                      {series.map((pt) => {
                        const msgHeight = Math.round(
                          (pt.messagesSent / maxVal) * 140,
                        );
                        const usrHeight = Math.round(
                          (pt.activeUsers / maxVal) * 140,
                        );
                        return (
                          <Box
                            key={pt.date}
                            sx={{
                              display: "flex",
                              flexDirection: "column",
                              alignItems: "center",
                              gap: 0.5,
                            }}
                          >
                            <Typography sx={{ fontSize: 10, color: "#5e6e82" }}>
                              {pt.messagesSent > 0 ? pt.messagesSent : ""}
                            </Typography>
                            <Stack
                              direction="row"
                              spacing={0.4}
                              sx={{ alignItems: "flex-end", height: 142 }}
                            >
                              <Box
                                title={`${pt.date}: ${pt.messagesSent} tin nhắn`}
                                sx={{
                                  width: { xs: 8, sm: 12 },
                                  height: Math.max(msgHeight, 4),
                                  bgcolor: "#0866ff",
                                  borderRadius: "4px 4px 0 0",
                                }}
                              />
                              <Box
                                title={`${pt.date}: ${pt.activeUsers} người dùng hoạt động`}
                                sx={{
                                  width: { xs: 8, sm: 12 },
                                  height: Math.max(usrHeight, 4),
                                  bgcolor: "#10b981",
                                  borderRadius: "4px 4px 0 0",
                                }}
                              />
                            </Stack>
                            <Typography sx={{ fontSize: 10, color: "#768496", pb: 0.5 }}>
                              {pt.date.slice(5)}
                            </Typography>
                          </Box>
                        );
                      })}
                    </Box>
                  );
                })()}
              </Paper>

              <Paper
                elevation={0}
                sx={{ p: 2.5, borderRadius: 3, border: "1px solid #e5ecf4" }}
              >
                <Typography sx={{ fontWeight: 700, fontSize: 15.5, mb: 2 }}>
                  Phân loại 5 dạng tin nhắn (Payloads)
                </Typography>
                <Stack spacing={1.75}>
                  {systemStats.messagesByKind.map((item) => {
                    const meta = KIND_LABELS[item.kind] ?? {
                      label: item.kind,
                      color: "#0866ff",
                    };
                    const pct =
                      systemStats.totalMessagesInRange > 0
                        ? Math.round(
                            (item.count / systemStats.totalMessagesInRange) * 100,
                          )
                        : 0;
                    return (
                      <Box key={item.kind}>
                        <Box
                          sx={{
                            display: "flex",
                            justifyContent: "space-between",
                            mb: 0.5,
                          }}
                        >
                          <Typography sx={{ fontSize: 13, fontWeight: 600 }}>
                            {meta.label}
                          </Typography>
                          <Typography sx={{ fontSize: 12.5, color: "#5e6e82" }}>
                            {item.count} ({pct}%)
                          </Typography>
                        </Box>
                        <LinearProgress
                          variant="determinate"
                          value={pct}
                          sx={{
                            height: 8,
                            borderRadius: 4,
                            bgcolor: "#edf2f8",
                            "& .MuiLinearProgress-bar": {
                              bgcolor: meta.color,
                              borderRadius: 4,
                            },
                          }}
                        />
                      </Box>
                    );
                  })}
                </Stack>
              </Paper>
            </Box>

            {/* Media Storage & Active Groups */}
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", lg: "1fr 1.2fr" },
                gap: 2.5,
              }}
            >
              <Paper
                elevation={0}
                sx={{ p: 2.5, borderRadius: 3, border: "1px solid #e5ecf4" }}
              >
                <Typography sx={{ fontWeight: 700, fontSize: 15.5, mb: 1.5 }}>
                  Dung lượng Media & Biến động thành viên nhóm
                </Typography>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Loại tệp</TableCell>
                      <TableCell align="right">Số tệp tải lên</TableCell>
                      <TableCell align="right">Dung lượng</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {systemStats.mediaUsageByKind.map((m) => (
                      <TableRow key={m.kind}>
                        <TableCell sx={{ fontWeight: 600 }}>
                          {KIND_LABELS[m.kind]?.label ?? m.kind}
                        </TableCell>
                        <TableCell align="right">{m.count}</TableCell>
                        <TableCell align="right">
                          {formatFileSize(m.totalBytes)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                <Stack direction="row" spacing={2} sx={{ mt: 2 }}>
                  <Chip
                    color="success"
                    variant="outlined"
                    label={`+${systemStats.groupMembersAddedInRange} lượt thêm thành viên`}
                  />
                  <Chip
                    color="warning"
                    variant="outlined"
                    label={`${systemStats.groupMembersRemovedInRange} lượt rời / xóa thành viên`}
                  />
                </Stack>
              </Paper>

              <Paper
                elevation={0}
                sx={{ p: 2.5, borderRadius: 3, border: "1px solid #e5ecf4" }}
              >
                <Typography sx={{ fontWeight: 700, fontSize: 15.5, mb: 1.5 }}>
                  Top nhóm hoạt động sôi nổi
                </Typography>
                {systemStats.topActiveGroups.length > 0 ? (
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Tên nhóm</TableCell>
                        <TableCell align="right">Thành viên</TableCell>
                        <TableCell align="right">Tin nhắn</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {systemStats.topActiveGroups.map((g) => (
                        <TableRow key={g.conversationId}>
                          <TableCell sx={{ fontWeight: 600 }}>{g.title}</TableCell>
                          <TableCell align="right">{g.memberCount}</TableCell>
                          <TableCell align="right">{g.messageCount}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <Typography sx={{ fontSize: 13, color: "#7f8d9f" }}>
                    Chưa có hoạt động tin nhắn nhóm trong khoảng thời gian này.
                  </Typography>
                )}
              </Paper>
            </Box>
          </Stack>
        ) : myStats ? (
          <Stack spacing={3}>
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: {
                  xs: "1fr",
                  sm: "repeat(2, 1fr)",
                  lg: "repeat(4, 1fr)",
                },
                gap: 2,
              }}
            >
              {kpiCard(
                "TIN NHẮN BẠN ĐÃ GỬI",
                myStats.messagesSent,
                `Trong ${myStats.days} ngày gần nhất`,
                "#0866ff",
              )}
              {kpiCard(
                "BIỂU CẢM ĐÃ THẢ",
                myStats.reactionsAdded,
                "Tương tác trên các cuộc trò chuyện",
                "#ec4899",
              )}
              {kpiCard(
                "TỆP ĐÃ TẢI LÊN",
                myStats.filesUploaded,
                `Tổng dung lượng ${formatFileSize(myStats.totalUploadedBytes)}`,
                "#10b981",
              )}
              {kpiCard(
                "HỘI THOẠI THAM GIA",
                `${myStats.groupsJoined} nhóm`,
                `${myStats.directChatsCount} cuộc trò chuyện 1-1`,
                "#f59e0b",
              )}
            </Box>

            <Paper
              elevation={0}
              sx={{ p: 2.5, borderRadius: 3, border: "1px solid #e5ecf4" }}
            >
              <Typography sx={{ fontWeight: 700, fontSize: 15.5, mb: 2 }}>
                Phân loại tin nhắn bạn đã gửi
              </Typography>
              <Stack spacing={1.5}>
                {myStats.messagesByKind.map((item) => {
                  const meta = KIND_LABELS[item.kind] ?? {
                    label: item.kind,
                    color: "#0866ff",
                  };
                  const pct =
                    myStats.messagesSent > 0
                      ? Math.round((item.count / myStats.messagesSent) * 100)
                      : 0;
                  return (
                    <Box key={item.kind}>
                      <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.4 }}>
                        <Typography sx={{ fontSize: 13, fontWeight: 600 }}>
                          {meta.label}
                        </Typography>
                        <Typography sx={{ fontSize: 12.5 }}>
                          {item.count} ({pct}%)
                        </Typography>
                      </Box>
                      <LinearProgress
                        variant="determinate"
                        value={pct}
                        sx={{
                          height: 8,
                          borderRadius: 4,
                          bgcolor: "#edf2f8",
                          "& .MuiLinearProgress-bar": { bgcolor: meta.color },
                        }}
                      />
                    </Box>
                  );
                })}
              </Stack>
            </Paper>
          </Stack>
        ) : null}
      </Box>
    </Box>
  );
};

export default AnalyticsDashboard;
