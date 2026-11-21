import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { getCustomApiUrl } from './storage';

export const normalizeBaseUrl = (raw?: string | null): string => {
  let cleaned = (raw ?? '').trim();
  if (!cleaned) return '';
  if (!/^https?:\/\//i.test(cleaned)) {
    cleaned = `http://${cleaned}`;
  }
  cleaned = cleaned.replace(/\/+$/, '');
  cleaned = cleaned.replace(/\/graphql$/i, '');
  return cleaned;
};

export const detectExpoHostIp = (): string | null => {
  const hostUri = Constants.expoConfig?.hostUri;
  if (!hostUri) return null;
  const host = hostUri.split(':')[0]?.trim();
  if (!host) return null;
  // Ignore Expo tunnel hostnames (*.exp.direct / *.ngrok*) since port 3000 isn't on that tunnel
  if (host.includes('exp.direct') || host.includes('ngrok')) {
    return null;
  }
  return host;
};

export const getDefaultApiBaseUrl = (): string => {
  const fromEnv = normalizeBaseUrl(process.env.EXPO_PUBLIC_API_URL);
  if (fromEnv) return fromEnv;

  // When running as a Cloud / Docker Web build (e.g. AWS EC2 :3001 or localhost:3001),
  // Nginx reverse-proxies /graphql, /uploads, and /socket.io/ on the exact same origin.
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const { protocol, hostname, port, origin } = window.location;
    // Local Metro web dev server (`expo start --web` runs on 8081 / 19006) -> talk to backend gateway on :3000
    if (port === '8081' || port === '19006') {
      return `${protocol}//${hostname}:3000`;
    }
    return origin;
  }

  const lanHost = detectExpoHostIp();
  if (lanHost) {
    return `http://${lanHost}:3000`;
  }

  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:3000';
  }
  return 'http://localhost:3000';
};

export const getApiBaseUrl = (): string => {
  const custom = getCustomApiUrl();
  if (custom) return custom;
  return getDefaultApiBaseUrl();
};

export const getGraphqlUrl = (): string => {
  const custom = getCustomApiUrl();
  if (custom) return `${custom}/graphql`;

  const explicitGraphql = (process.env.EXPO_PUBLIC_GRAPHQL_URL ?? '').trim();
  if (explicitGraphql) return explicitGraphql;

  return `${getApiBaseUrl()}/graphql`;
};

export const getSocketBaseUrl = (): string => {
  const custom = getCustomApiUrl();
  if (custom) return custom;

  const explicitWs = normalizeBaseUrl(process.env.EXPO_PUBLIC_WS_URL);
  if (explicitWs) return explicitWs;

  return getApiBaseUrl();
};

export const resolveMediaUrl = (rawUrl?: string | null): string | undefined => {
  const trimmed = (rawUrl ?? '').trim();
  if (!trimmed) return undefined;
  if (
    /^https?:\/\//i.test(trimmed) ||
    trimmed.startsWith('file://') ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('blob:')
  ) {
    return trimmed;
  }
  const base = getApiBaseUrl();
  if (trimmed.startsWith('/')) {
    return `${base}${trimmed}`;
  }
  return `${base}/${trimmed}`;
};

export interface ServerPingResult {
  ok: boolean;
  url: string;
  latencyMs: number;
  message: string;
}

export const testServerConnection = async (
  candidateBaseUrl?: string,
): Promise<ServerPingResult> => {
  const base = candidateBaseUrl
    ? normalizeBaseUrl(candidateBaseUrl)
    : getApiBaseUrl();
  const graphqlEndpoint = `${base}/graphql`;
  const startedAt = Date.now();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6500);

  try {
    const response = await fetch(graphqlEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ query: '{ health }' }),
      signal: controller.signal,
    });
    const latencyMs = Date.now() - startedAt;
    const json = (await response.json().catch(() => null)) as {
      data?: { health?: string };
    } | null;

    if (response.ok && json?.data?.health === 'ok') {
      return {
        ok: true,
        url: base,
        latencyMs,
        message: `Kết nối thành công tới ${base} (${latencyMs} ms)`,
      };
    }
    return {
      ok: false,
      url: base,
      latencyMs,
      message: `Máy chủ phản hồi mã HTTP ${response.status}. Kiểm tra lại địa chỉ ${base}.`,
    };
  } catch (err) {
    const latencyMs = Date.now() - startedAt;
    const reason =
      err instanceof Error && err.name === 'AbortError'
        ? 'Quá thời gian chờ (6.5s). Hãy kiểm tra kết nối mạng hoặc tường lửa cổng 3000/3001.'
        : err instanceof Error
          ? err.message
          : 'Không thể kết nối máy chủ.';
    return {
      ok: false,
      url: base,
      latencyMs,
      message: reason,
    };
  } finally {
    clearTimeout(timer);
  }
};
