import { createBrowserRouter, Navigate, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { Alert, Box, Button, CircularProgress, Stack } from "@mui/material";
import Login from "./auth/Login";
import Signup from "./auth/Signup";
import Dashboard from "./auth/Dashboard";
import {
  clearAccessToken,
  getAccessToken,
  GraphQLRequestError,
  graphqlRequest,
} from "../services/graphql";
import { CurrentUserProfile } from "../types/chat";

const ProtectedDashboard = () => {
  const navigate = useNavigate();
  const [isChecking, setIsChecking] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState<CurrentUserProfile | null>(
    null,
  );
  const [requestError, setRequestError] = useState("");
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let isMounted = true;
    if (!getAccessToken()) {
      setIsChecking(false);
      return () => {
        isMounted = false;
      };
    }

    graphqlRequest<{ me: CurrentUserProfile }>(
      `query CurrentUser {
        me {
          id
          email
          displayName
          avatarUrl
          status
          role
          lastSeenAt
        }
      }`,
    )
      .then(({ me }) => {
        if (isMounted) {
          setCurrentUser(me);
          setIsAuthenticated(true);
          setRequestError("");
        }
      })
      .catch((error: unknown) => {
        if (!isMounted) return;
        if (
          error instanceof GraphQLRequestError &&
          error.codes.includes("UNAUTHENTICATED")
        ) {
          clearAccessToken();
          setIsAuthenticated(false);
          return;
        }
        setRequestError(
          error instanceof Error
            ? error.message
            : "Không thể kiểm tra phiên đăng nhập.",
        );
      })
      .finally(() => {
        if (isMounted) setIsChecking(false);
      });

    return () => {
      isMounted = false;
    };
  }, [retryCount]);

  if (isChecking) {
    return (
      <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
        <CircularProgress aria-label="Đang kiểm tra đăng nhập" />
      </Box>
    );
  }

  if (requestError) {
    return (
      <Stack spacing={2} sx={{ maxWidth: 480, mx: "auto", mt: 12, px: 2 }}>
        <Alert severity="error">{requestError}</Alert>
        <Button
          variant="contained"
          onClick={() => {
            setRequestError("");
            setIsChecking(true);
            setRetryCount((count) => count + 1);
          }}
        >
          Thử kết nối lại
        </Button>
      </Stack>
    );
  }

  return isAuthenticated && currentUser ? (
    <Dashboard
      currentUserId={currentUser.id}
      currentUser={currentUser}
      onUserUpdated={setCurrentUser}
      onLogout={() => {
        clearAccessToken();
        navigate("/login", { replace: true });
      }}
    />
  ) : (
    <Navigate to="/login" replace />
  );
};

const router = createBrowserRouter([
  {
    path: "/",
    element: <ProtectedDashboard />,
  },
  {
    path: "/login",
    element: <Login />,
  },
  {
    path: "/signup",
    element: <Signup />,
  },
]);

export default router;
