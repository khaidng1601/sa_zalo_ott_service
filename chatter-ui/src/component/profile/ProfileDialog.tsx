import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import PhotoCameraOutlinedIcon from "@mui/icons-material/PhotoCameraOutlined";
import { graphqlRequest } from "../../services/graphql";
import { uploadAvatarFile } from "../../services/uploads";
import { CurrentUserProfile, getInitials } from "../../types/chat";

interface ProfileDialogProps {
  open: boolean;
  onClose: () => void;
  profile: CurrentUserProfile | null;
  onProfileUpdated: (updated: CurrentUserProfile) => void;
}

const ProfileDialog: React.FC<ProfileDialogProps> = ({
  open,
  onClose,
  profile,
  onProfileUpdated,
}) => {
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (profile && open) {
      setDisplayName(profile.displayName || "");
      setAvatarUrl(profile.avatarUrl || "");
      setCurrentPassword("");
      setNewPassword("");
      setError("");
      setSuccess("");
    }
  }, [profile, open]);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setIsUploadingAvatar(true);
    setError("");
    try {
      const res = await uploadAvatarFile(file);
      setAvatarUrl(res.url);
      setSuccess("Đã tải ảnh đại diện lên. Nhấn Lưu hồ sơ để áp dụng.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Tải ảnh thất bại.");
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError("");
    setSuccess("");
    try {
      const res = await graphqlRequest<{ updateMyProfile: CurrentUserProfile }>(
        `mutation UpdateProfile($input: UpdateProfileInput!) {
          updateMyProfile(input: $input) {
            id email displayName avatarUrl status role lastSeenAt
          }
        }`,
        {
          input: {
            displayName: displayName.trim(),
            avatarUrl: avatarUrl.trim(),
          },
        },
      );
      onProfileUpdated(res.updateMyProfile);
      setSuccess("Đã cập nhật thông tin cá nhân.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cập nhật thất bại.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword) return;
    setIsSaving(true);
    setError("");
    setSuccess("");
    try {
      await graphqlRequest(
        `mutation ChangePassword($currentPassword: String!, $newPassword: String!) {
          changeMyPassword(currentPassword: $currentPassword, newPassword: $newPassword)
        }`,
        { currentPassword, newPassword },
      );
      setCurrentPassword("");
      setNewPassword("");
      setSuccess("Đã đổi mật khẩu thành công.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Đổi mật khẩu thất bại.");
    } finally {
      setIsSaving(false);
    }
  };

  if (!profile) return null;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ fontWeight: 700 }}>Hồ sơ & Cài đặt tài khoản</DialogTitle>
      <DialogContent dividers>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>
            {error}
          </Alert>
        )}
        {success && (
          <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess("")}>
            {success}
          </Alert>
        )}

        <Box component="form" onSubmit={handleSaveProfile}>
          <Stack direction="row" spacing={2.5} sx={{ alignItems: "center", mb: 2.5 }}>
            <Avatar
              src={avatarUrl || undefined}
              sx={{ width: 68, height: 68, bgcolor: "#0866ff", fontSize: 22, fontWeight: 700 }}
            >
              {getInitials(displayName || profile.displayName)}
            </Avatar>
            <Box>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 0.5 }}>
                <Typography sx={{ fontWeight: 700 }}>{profile.email}</Typography>
                <Chip
                  size="small"
                  color={profile.role === "ADMIN" ? "primary" : "default"}
                  label={profile.role === "ADMIN" ? "System Admin" : "Thành viên"}
                />
              </Stack>
              <input
                ref={fileRef}
                type="file"
                hidden
                accept="image/jpeg,image/png,image/gif,image/webp"
                onChange={handleAvatarUpload}
              />
              <Button
                size="small"
                variant="outlined"
                startIcon={
                  isUploadingAvatar ? (
                    <CircularProgress size={14} />
                  ) : (
                    <PhotoCameraOutlinedIcon />
                  )
                }
                disabled={isUploadingAvatar}
                onClick={() => fileRef.current?.click()}
              >
                Tải ảnh đại diện mới
              </Button>
            </Box>
          </Stack>

          <Stack spacing={2}>
            <TextField
              fullWidth
              size="small"
              label="Tên hiển thị"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
            />
            <TextField
              fullWidth
              size="small"
              label="URL ảnh đại diện (tùy chọn)"
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
            />
            <Box sx={{ textAlign: "right" }}>
              <Button
                type="submit"
                variant="contained"
                disabled={isSaving || !displayName.trim()}
              >
                Lưu hồ sơ
              </Button>
            </Box>
          </Stack>
        </Box>

        <Divider sx={{ my: 2.5 }} />

        <Typography sx={{ fontWeight: 700, fontSize: 14.5, mb: 1.5 }}>
          Đổi mật khẩu
        </Typography>
        <Stack spacing={1.5}>
          <TextField
            fullWidth
            size="small"
            type="password"
            label="Mật khẩu hiện tại"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
          <TextField
            fullWidth
            size="small"
            type="password"
            label="Mật khẩu mới (tối thiểu 8 ký tự)"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
          <Box sx={{ textAlign: "right" }}>
            <Button
              variant="outlined"
              disabled={isSaving || !currentPassword || newPassword.length < 8}
              onClick={() => void handleChangePassword()}
            >
              Cập nhật mật khẩu
            </Button>
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Đóng</Button>
      </DialogActions>
    </Dialog>
  );
};

export default ProfileDialog;
