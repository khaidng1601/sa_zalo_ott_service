import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { getApiBaseUrl } from '../services/config';
import {
  graphqlRequest,
  GraphQLRequestError,
  setOnUnauthorizedListener,
} from '../services/graphql';
import {
  clearAccessToken,
  hydrateSecureSession,
  saveAccessToken,
  saveCustomApiUrl,
} from '../services/storage';
import { CurrentUserProfile } from '../types/chat';

const ME_QUERY = `
  query CurrentUser {
    me {
      id
      email
      displayName
      avatarUrl
      status
      role
      lastSeenAt
    }
  }
`;

const LOGIN_MUTATION = `
  mutation Login($email: String!, $password: String!) {
    login(email: $email, password: $password) {
      accessToken
    }
  }
`;

const REGISTER_MUTATION = `
  mutation Register($input: CreateUserInput!) {
    register(createUserInput: $input) {
      accessToken
    }
  }
`;

interface AuthContextValue {
  isBooting: boolean;
  currentUser: CurrentUserProfile | null;
  bootError: string | null;
  apiBaseUrl: string;
  login: (email: string, password: string) => Promise<void>;
  register: (params: {
    email: string;
    password: string;
    displayName: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  retryBootSession: () => Promise<void>;
  setCurrentUser: React.Dispatch<React.SetStateAction<CurrentUserProfile | null>>;
  updateServerUrl: (customUrl: string | null) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [isBooting, setIsBooting] = useState(true);
  const [currentUser, setCurrentUser] = useState<CurrentUserProfile | null>(
    null,
  );
  const [bootError, setBootError] = useState<string | null>(null);
  const [apiBaseUrl, setApiBaseUrl] = useState<string>(getApiBaseUrl());

  const fetchCurrentUser = useCallback(async (): Promise<CurrentUserProfile> => {
    const { me } = await graphqlRequest<{ me: CurrentUserProfile }>(ME_QUERY);
    return me;
  }, []);

  const verifyStoredSession = useCallback(async () => {
    setIsBooting(true);
    setBootError(null);
    try {
      const { token } = await hydrateSecureSession();
      setApiBaseUrl(getApiBaseUrl());
      if (!token) {
        setCurrentUser(null);
        return;
      }
      const me = await fetchCurrentUser();
      setCurrentUser(me);
    } catch (err) {
      if (
        err instanceof GraphQLRequestError &&
        err.codes.includes('UNAUTHENTICATED')
      ) {
        await clearAccessToken();
        setCurrentUser(null);
        return;
      }
      setBootError(
        err instanceof Error
          ? err.message
          : 'Không thể kiểm tra phiên đăng nhập.',
      );
    } finally {
      setIsBooting(false);
    }
  }, [fetchCurrentUser]);

  useEffect(() => {
    void verifyStoredSession();
  }, [verifyStoredSession]);

  useEffect(() => {
    setOnUnauthorizedListener(() => {
      void clearAccessToken();
      setCurrentUser(null);
    });
    return () => setOnUnauthorizedListener(null);
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const normalizedEmail = email.trim().toLowerCase();
      const result = await graphqlRequest<{
        login: { accessToken: string };
      }>(LOGIN_MUTATION, {
        email: normalizedEmail,
        password,
      });
      await saveAccessToken(result.login.accessToken);
      const me = await fetchCurrentUser();
      setCurrentUser(me);
      setBootError(null);
    },
    [fetchCurrentUser],
  );

  const register = useCallback(
    async ({
      email,
      password,
      displayName,
    }: {
      email: string;
      password: string;
      displayName: string;
    }) => {
      const result = await graphqlRequest<{
        register: { accessToken: string };
      }>(REGISTER_MUTATION, {
        input: {
          email: email.trim().toLowerCase(),
          password,
          displayName: displayName.trim(),
        },
      });
      await saveAccessToken(result.register.accessToken);
      const me = await fetchCurrentUser();
      setCurrentUser(me);
      setBootError(null);
    },
    [fetchCurrentUser],
  );

  const logout = useCallback(async () => {
    await clearAccessToken();
    setCurrentUser(null);
    setBootError(null);
  }, []);

  const updateServerUrl = useCallback(async (customUrl: string | null) => {
    await saveCustomApiUrl(customUrl);
    setApiBaseUrl(getApiBaseUrl());
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      isBooting,
      currentUser,
      bootError,
      apiBaseUrl,
      login,
      register,
      logout,
      retryBootSession: verifyStoredSession,
      setCurrentUser,
      updateServerUrl,
    }),
    [
      isBooting,
      currentUser,
      bootError,
      apiBaseUrl,
      login,
      register,
      logout,
      verifyStoredSession,
      updateServerUrl,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
};
