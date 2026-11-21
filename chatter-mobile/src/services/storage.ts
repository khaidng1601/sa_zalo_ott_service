import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const ACCESS_TOKEN_KEY = 'chatter_access_token';
const CUSTOM_API_URL_KEY = 'chatter_api_base_url';

let cachedToken: string | null = null;
let cachedCustomApiUrl: string | null = null;

const readKey = async (key: string): Promise<string | null> => {
  try {
    if (Platform.OS === 'web') {
      return typeof window !== 'undefined'
        ? window.localStorage.getItem(key)
        : null;
    }
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
};

const writeKey = async (key: string, value: string): Promise<void> => {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(key, value);
    }
    return;
  }
  await SecureStore.setItemAsync(key, value);
};

const removeKey = async (key: string): Promise<void> => {
  try {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(key);
      }
      return;
    }
    await SecureStore.deleteItemAsync(key);
  } catch {
    // Ignore secure store removal errors
  }
};

export const hydrateSecureSession = async (): Promise<{
  token: string | null;
  customApiUrl: string | null;
}> => {
  const [token, customApiUrl] = await Promise.all([
    readKey(ACCESS_TOKEN_KEY),
    readKey(CUSTOM_API_URL_KEY),
  ]);
  cachedToken = token;
  cachedCustomApiUrl = customApiUrl;
  return { token, customApiUrl };
};

export const getAccessToken = (): string | null => cachedToken;

export const saveAccessToken = async (token: string): Promise<void> => {
  cachedToken = token;
  await writeKey(ACCESS_TOKEN_KEY, token);
};

export const clearAccessToken = async (): Promise<void> => {
  cachedToken = null;
  await removeKey(ACCESS_TOKEN_KEY);
};

export const getCustomApiUrl = (): string | null => cachedCustomApiUrl;

export const saveCustomApiUrl = async (url: string | null): Promise<void> => {
  const normalized = (url ?? '').trim().replace(/\/+$/, '');
  if (!normalized) {
    cachedCustomApiUrl = null;
    await removeKey(CUSTOM_API_URL_KEY);
    return;
  }
  cachedCustomApiUrl = normalized;
  await writeKey(CUSTOM_API_URL_KEY, normalized);
};
