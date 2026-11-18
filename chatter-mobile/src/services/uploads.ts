import { Platform } from 'react-native';
import { getApiBaseUrl } from './config';
import { getAccessToken } from './storage';

export interface LocalUploadAsset {
  uri: string;
  name?: string | null;
  mimeType?: string | null;
  size?: number | null;
  webFile?: File;
}

export interface UploadedAttachment {
  storageKey: string;
  kind: 'image' | 'video' | 'document';
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
  url: string;
}

const MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  pdf: 'application/pdf',
  txt: 'text/plain',
  csv: 'text/csv',
  md: 'text/markdown',
  json: 'application/json',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  zip: 'application/zip',
};

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  'application/pdf': 'pdf',
  'text/plain': 'txt',
  'text/csv': 'csv',
  'application/zip': 'zip',
};

const normalizeUploadDescriptor = (asset: LocalUploadAsset) => {
  const uriClean = asset.uri.split('?')[0] ?? '';
  const uriTail = uriClean.split('/').pop() ?? '';
  const rawName = (asset.name || uriTail || '').trim();
  const extFromName = rawName.includes('.')
    ? rawName.split('.').pop()?.toLowerCase() ?? ''
    : '';

  let mimeType = (asset.mimeType ?? '').trim().toLowerCase();
  if (!mimeType || mimeType === 'image' || mimeType === 'video') {
    if (extFromName && MIME_BY_EXT[extFromName]) {
      mimeType = MIME_BY_EXT[extFromName];
    } else if (mimeType === 'video') {
      mimeType = 'video/mp4';
    } else if (mimeType === 'image') {
      mimeType = 'image/jpeg';
    } else {
      mimeType = 'application/octet-stream';
    }
  }
  // Convert HEIC/HEIF hint to JPEG since ImagePicker quality < 1 transcodes to JPEG
  if (mimeType === 'image/heic' || mimeType === 'image/heif') {
    mimeType = 'image/jpeg';
  }

  let fileName = rawName;
  if (!fileName || !fileName.includes('.')) {
    const fallbackExt = EXT_BY_MIME[mimeType] || extFromName || 'bin';
    fileName = `upload_${Date.now()}.${fallbackExt}`;
  } else if (/\.(heic|heif)$/i.test(fileName) && mimeType === 'image/jpeg') {
    fileName = fileName.replace(/\.(heic|heif)$/i, '.jpg');
  }

  return {
    uri: asset.uri,
    name: fileName,
    type: mimeType,
  };
};

const buildMultipartForm = async (asset: LocalUploadAsset): Promise<FormData> => {
  const formData = new FormData();
  const descriptor = normalizeUploadDescriptor(asset);

  if (Platform.OS === 'web') {
    if (asset.webFile) {
      formData.append('file', asset.webFile);
    } else {
      const blobRes = await fetch(descriptor.uri);
      const blob = await blobRes.blob();
      formData.append('file', blob, descriptor.name);
    }
  } else {
    formData.append('file', {
      uri: descriptor.uri,
      name: descriptor.name,
      type: descriptor.type,
    } as unknown as Blob);
  }

  return formData;
};

export const uploadConversationFile = async (
  conversationId: string,
  asset: LocalUploadAsset,
): Promise<UploadedAttachment> => {
  const token = getAccessToken();
  const formData = await buildMultipartForm(asset);
  const url = `${getApiBaseUrl()}/uploads/conversation/${encodeURIComponent(conversationId)}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: formData,
  });

  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const msg =
      typeof body?.message === 'string'
        ? body.message
        : Array.isArray(body?.message)
          ? body.message.join(', ')
          : `Tải tệp lên thất bại (HTTP ${response.status}).`;
    throw new Error(msg);
  }

  return body as unknown as UploadedAttachment;
};

export const uploadAvatarFile = async (
  asset: LocalUploadAsset,
): Promise<{ url: string }> => {
  const token = getAccessToken();
  const formData = await buildMultipartForm(asset);
  const url = `${getApiBaseUrl()}/uploads/avatar`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: formData,
  });

  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const msg =
      typeof body?.message === 'string'
        ? body.message
        : `Tải ảnh đại diện thất bại (HTTP ${response.status}).`;
    throw new Error(msg);
  }

  return body as { url: string };
};

export const formatFileSize = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};
