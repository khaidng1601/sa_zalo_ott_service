import {
  Alert,
  Box,
  Button,
  CircularProgress,
  IconButton,
  Input,
  InputAdornment,
  Stack,
  Typography,
} from "@mui/material";
import ChatRoundedIcon from "@mui/icons-material/ChatRounded";
import EmailOutlinedIcon from "@mui/icons-material/EmailOutlined";
import HttpsOutlinedIcon from "@mui/icons-material/HttpsOutlined";
import VisibilityRoundedIcon from "@mui/icons-material/VisibilityRounded";
import VisibilityOffRoundedIcon from "@mui/icons-material/VisibilityOffRounded";
import React from "react";

export interface AuthCredentials {
  email: string;
  password: string;
  displayName?: string;
}

interface AuthProps {
  mode: "login" | "register";
  submitLabel: string;
  onSubmit: (credential: AuthCredentials) => Promise<void>;
  children: React.ReactNode;
}

const Auth = ({ mode, submitLabel, onSubmit, children }: AuthProps) => {
    const [email, setEmail] = React.useState("");
    const [displayName, setDisplayName] = React.useState("");
    const [password, setPassword] = React.useState("");
    const [error, setError] = React.useState("");
    const [isSubmitting, setIsSubmitting] = React.useState(false);
    const [showPassword, setShowPassword] = React.useState(false);

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setError("");
        setIsSubmitting(true);
        try {
            await onSubmit({
                email,
                password,
                ...(mode === "register" ? { displayName } : {}),
            });
        } catch (submitError) {
            setError(
                submitError instanceof Error
                    ? submitError.message
                    : "Có lỗi xảy ra. Vui lòng thử lại.",
            );
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Box
            component="main"
            sx={{
                minHeight: "100vh",
                boxSizing: "border-box",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                px: 2,
                py: { xs: 3, sm: 5 },
                bgcolor: "#e8f3ff",
            }}
        >
            <Stack spacing={0.75} sx={{ alignItems: "center", mb: 2 }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, color: "#0190f3" }}>
                    <ChatRoundedIcon sx={{ fontSize: 36 }} />
                    <Typography variant="h4" sx={{ fontWeight: 700, letterSpacing: -1 }}>
                        Chatter
                    </Typography>
                </Box>
                <Typography color="text.secondary" sx={{ textAlign: "center", fontSize: 14 }}>
                    {mode === "login"
                        ? "Đăng nhập để tiếp tục trò chuyện trên Chatter Web"
                        : "Tạo tài khoản để kết nối với mọi người"}
                </Typography>
            </Stack>

            <Box
                sx={{
                    width: "min(100%, 480px)",
                    boxSizing: "border-box",
                    p: { xs: 2.5, sm: 4 },
                    borderRadius: 3,
                    bgcolor: "white",
                    boxShadow: "0 8px 32px rgba(30, 70, 110, 0.12)",
                }}
            >
                <Typography
                    component="h1"
                    sx={{
                        textAlign: "center",
                        fontWeight: 600,
                        color: "grey.800",
                        fontSize: 20,
                        pb: 2,
                        borderBottom: "1px solid #e2e5e9",
                    }}
                >
                    {mode === "login" ? "Đăng nhập với mật khẩu" : "Đăng ký tài khoản"}
                </Typography>

                <Stack component="form" onSubmit={handleSubmit} spacing={2.5} sx={{ pt: 2 }}>
                    {error && (
                        <Alert severity="error" role="alert">
                            {error}
                        </Alert>
                    )}
                    {mode === "register" && (
                        <Input
                            aria-label="Tên hiển thị"
                            placeholder="Tên hiển thị"
                            autoComplete="name"
                            inputProps={{ maxLength: 80, required: true }}
                            value={displayName}
                            onChange={(event) => setDisplayName(event.target.value)}
                            startAdornment={
                                <InputAdornment position="start">
                                    <ChatRoundedIcon sx={{ color: "grey.600", fontSize: 20 }} />
                                </InputAdornment>
                            }
                            sx={authInputSx}
                            disabled={isSubmitting}
                        />
                    )}
                    <Input
                        aria-label="Email"
                        type="email"
                        placeholder="Email"
                        autoComplete="email"
                        inputProps={{ required: true, maxLength: 254 }}
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        startAdornment={
                            <InputAdornment position="start">
                                <EmailOutlinedIcon sx={{ color: "grey.600", fontSize: 20 }} />
                            </InputAdornment>
                        }
                        sx={authInputSx}
                        disabled={isSubmitting}
                    />
                    <Input
                        aria-label="Mật khẩu"
                        type={showPassword ? "text" : "password"}
                        placeholder="Mật khẩu"
                        autoComplete={mode === "login" ? "current-password" : "new-password"}
                        inputProps={{ required: true, minLength: 8, maxLength: 128 }}
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        startAdornment={
                            <InputAdornment position="start">
                                <HttpsOutlinedIcon sx={{ color: "grey.600", fontSize: 20 }} />
                            </InputAdornment>
                        }
                        endAdornment={
                            <InputAdornment position="end">
                                <IconButton
                                    aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                                    onClick={() => setShowPassword((visible) => !visible)}
                                    edge="end"
                                    size="small"
                                >
                                    {showPassword
                                        ? <VisibilityOffRoundedIcon fontSize="small" />
                                        : <VisibilityRoundedIcon fontSize="small" />}
                                </IconButton>
                            </InputAdornment>
                        }
                        sx={authInputSx}
                        disabled={isSubmitting}
                    />
                    <Button
                        variant="contained"
                        type="submit"
                        disabled={isSubmitting}
                        sx={{
                            minHeight: 44,
                            mt: 1,
                            bgcolor: "#0190f3",
                            fontWeight: 600,
                            "&:hover": { bgcolor: "#087fce" },
                        }}
                    >
                        {isSubmitting ? (
                            <CircularProgress size={22} color="inherit" />
                        ) : submitLabel}
                    </Button>
                    {children}
                </Stack>

                <Box
                    sx={{
                        mt: 3,
                        p: 1.5,
                        display: "flex",
                        alignItems: "center",
                        gap: 1.25,
                        border: "1px solid #e2e5e9",
                        borderRadius: 2,
                        bgcolor: "#fbfcfe",
                    }}
                >
                    <ChatRoundedIcon sx={{ color: "#0190f3", fontSize: 24 }} />
                    <Box>
                        <Typography sx={{ fontSize: 12, fontWeight: 600, color: "grey.800" }}>
                            Chatter Web
                        </Typography>
                        <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
                            Nhắn tin và kết nối với bạn bè, nhóm của bạn.
                        </Typography>
                    </Box>
                </Box>
            </Box>
        </Box>
    );
};

const authInputSx = {
    fontSize: 15,
    "&:before": { borderBottom: "2px solid #dcdfe3" },
    "&:hover:not(.Mui-disabled, .Mui-error):before": {
        borderBottom: "2px solid #aeb8c2",
    },
    "&:after": { borderBottomColor: "#0190f3" },
    "& input": { py: 1.25 },
};

export default Auth;
