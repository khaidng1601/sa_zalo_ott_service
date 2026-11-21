import { getGraphqlUrl } from './config';
import { getAccessToken } from './storage';

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string; extensions?: { code?: string } }>;
}

export class GraphQLRequestError extends Error {
  constructor(
    message: string,
    readonly codes: string[] = [],
  ) {
    super(message);
    this.name = 'GraphQLRequestError';
  }
}

let unauthorizedListener: (() => void) | null = null;

export const setOnUnauthorizedListener = (listener: (() => void) | null) => {
  unauthorizedListener = listener;
};

export const graphqlRequest = async <T>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> => {
  const token = getAccessToken();
  const endpoint = getGraphqlUrl();

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ query, variables }),
    });
  } catch (networkErr) {
    const detail =
      networkErr instanceof Error ? networkErr.message : 'Network error';
    throw new Error(
      `Không thể kết nối tới máy chủ (${endpoint}). Chi tiết: ${detail}`,
    );
  }

  const result = (await response.json().catch(() => ({}))) as GraphQLResponse<T>;
  const codes =
    result.errors?.flatMap(({ extensions }) =>
      extensions?.code ? [extensions.code] : [],
    ) ?? [];

  if (response.status === 401 || codes.includes('UNAUTHENTICATED')) {
    unauthorizedListener?.();
  }

  if (!response.ok || result.errors?.length) {
    throw new GraphQLRequestError(
      result.errors?.map(({ message }) => message).join('\n') ??
        `Yêu cầu thất bại (HTTP ${response.status}).`,
      codes,
    );
  }

  if (!result.data) {
    throw new Error('Máy chủ trả về phản hồi GraphQL rỗng.');
  }

  return result.data;
};
