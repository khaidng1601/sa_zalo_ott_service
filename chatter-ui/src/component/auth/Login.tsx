import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Alert,
  Box,
  Chip,
  Link as MuiLink,
  Stack,
  Typography,
} from "@mui/material";
import Auth from "./Auth";
import { graphqlRequest, setAccessToken } from "../../services/graphql";

const DEMO_ACCOUNTS = [
  {
    label: "System Admin",
    email: "admin@chatter.vn",
    password: "Admin@123456",
  },
  {
    label: "Nguyễn Minh (Chủ nhóm)",
    email: "minh.nguyen@chatter.vn",
    password: "Password@123",
  },
  {
    label: "Trần Thị Lan (Admin nhóm)",
    email: "lan.tran@chatter.vn",
    password: "Password@123",
  },
  {
    label: "Lê Quốc Huy",
    email: "huy.le@chatter.vn",
    password: "Password@123",
  },
];

const Login = () => {
  const navigate = useNavigate();
  const [quickError, setQuickError] = useState("");
  const [quickBusy, setQuickBusy] = useState(false);

  const performLogin = async (email: string, password: string) => {
    const result = await graphqlRequest<{
      login: { accessToken: string };
    }>(
      `mutation Login($email: String!, $password: String!) {
        login(email: $email, password: $password) {
          accessToken
        }
      }`,
      { email, password },
    );
    setAccessToken(result.login.accessToken);
    navigate("/", { replace: true });
  };

  const handleQuickDemoLogin = async (email: string, password: string) => {
    setQuickError("");
    setQuickBusy(true);
    try {
      await performLogin(email, password);
    } catch (err) {
      setQuickError(
        err instanceof Error ? err.message : "Đăng nhập demo thất bại.",
      );
    } finally {
      setQuickBusy(false);
    }
  };

  return (
    <Auth
      mode="login"
      submitLabel="Đăng nhập"
      onSubmit={({ email, password }) => performLogin(email, password)}
    >
      <Link
        to="/signup"
        style={{
          textDecoration: "none",
          alignSelf: "center",
          marginTop: "6px",
        }}
      >
        <MuiLink component="span" variant="body2">
          Chưa có tài khoản? Đăng ký
        </MuiLink>
      </Link>

      <Box sx={{ pt: 1.5, borderTop: "1px dashed #e1e6ed" }}>
        <Typography
          sx={{
            fontSize: 11.5,
            color: "text.secondary",
            textAlign: "center",
            mb: 1,
          }}
        >
          Đăng nhập nhanh tài khoản Demo (1-click):
        </Typography>
        {quickError && (
          <Alert severity="error" sx={{ mb: 1, py: 0 }}>
            {quickError}
          </Alert>
        )}
        <Stack
          direction="row"
           sx={{ flexWrap: "wrap", gap: 0.75, justifyContent: "center" }}
        >
          {DEMO_ACCOUNTS.map((acc) => (
            <Chip
              key={acc.email}
              size="small"
              label={acc.label}
              disabled={quickBusy}
              onClick={() => void handleQuickDemoLogin(acc.email, acc.password)}
              sx={{
                cursor: "pointer",
                bgcolor: "#f0f6ff",
                color: "#0866ff",
                fontWeight: 600,
                "&:hover": { bgcolor: "#dceaff" },
              }}
            />
          ))}
        </Stack>
      </Box>
    </Auth>
  );
};

export default Login;
