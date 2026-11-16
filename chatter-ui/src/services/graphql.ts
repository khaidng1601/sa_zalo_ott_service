const GRAPHQL_URL =
  process.env.REACT_APP_GRAPHQL_URL ?? "http://localhost:4000/graphql";
const AUTH_TOKEN_KEY = "chatter.accessToken";

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
    this.name = "GraphQLRequestError";
  }
}

export const getAccessToken = () => window.sessionStorage.getItem(AUTH_TOKEN_KEY);

export const setAccessToken = (token: string) => {
  window.sessionStorage.setItem(AUTH_TOKEN_KEY, token);
};

export const clearAccessToken = () => {
  window.sessionStorage.removeItem(AUTH_TOKEN_KEY);
};

export const graphqlRequest = async <T>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> => {
  const token = getAccessToken();
  const response = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ query, variables }),
  });

  const result = (await response.json()) as GraphQLResponse<T>;
  if (!response.ok || result.errors?.length) {
    throw new GraphQLRequestError(
      result.errors?.map(({ message }) => message).join("\n") ??
        `Request failed with status ${response.status}.`,
      result.errors?.flatMap(({ extensions }) =>
        extensions?.code ? [extensions.code] : [],
      ) ?? [],
    );
  }
  if (!result.data) {
    throw new Error("The server returned an empty GraphQL response.");
  }
  return result.data;
};
