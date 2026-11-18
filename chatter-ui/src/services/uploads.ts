import { getAccessToken } from "./graphql";

const API_BASE_URL = (process.env.REACT_APP_API_URL ?? "").trim().replace(/\/$/, "");

export interface UploadedAttachment {
  storageKey: string;
  kind: "image" | "video" | "document";
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
  url: string;
}

export const uploadConversationFile = async (
  conversationId: string,
  file: File,
): Promise<UploadedAttachment> => {
  const token = typeof getAccessToken === "function" ? getAccessToken() : null;
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(
    `${API_BASE_URL}/uploads/conversation/${encodeURIComponent(conversationId)}`,
    {
      method: "POST",
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: formData,
    },
  );

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const msg =
      typeof body?.message === "string"
        ? body.message
        : Array.isArray(body?.message)
          ? body.message.join(", ")
          : `Tải tệp thất bại (${response.status}).`;
    throw new Error(msg);
  }
  return body as UploadedAttachment;
};

export const uploadAvatarFile = async (file: File): Promise<{ url: string }> => {
  const token = getAccessToken();
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${API_BASE_URL}/uploads/avatar`, {
    method: "POST",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: formData,
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const msg =
      typeof body?.message === "string"
        ? body.message
        : `Tải ảnh đại diện thất bại (${response.status}).`;
    throw new Error(msg);
  }
  return body as { url: string };
};

export const formatFileSize = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};
