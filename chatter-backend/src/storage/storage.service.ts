import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { ActivitiesService } from '../activities/activities.service.js';
import { ActivityEventType } from '../activities/schemas/user-activity.schema.js';
import { ConversationsService } from '../conversations/conversations.service.js';

export type AttachmentMediaKind = 'image' | 'video' | 'document';

export interface UploadedBinaryFile {
  fieldname: string;
  originalname: string;
  encoding?: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export interface StoredAttachmentResult {
  storageKey: string;
  kind: AttachmentMediaKind;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
  url: string;
}

const IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
]);

const VIDEO_MIMES = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime',
]);

const DOCUMENT_MIMES = new Set([
  'application/pdf',
  'text/plain',
  'text/csv',
  'text/markdown',
  'application/json',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/zip',
  'application/x-zip-compressed',
]);

const SAFE_DOC_EXTENSIONS = new Set([
  '.pdf',
  '.txt',
  '.csv',
  '.md',
  '.json',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.zip',
]);

const BLOCKED_EXTENSIONS = new Set([
  '.html',
  '.htm',
  '.svg',
  '.xhtml',
  '.js',
  '.mjs',
  '.cjs',
  '.exe',
  '.bat',
  '.cmd',
  '.ps1',
  '.sh',
]);

const startsWith = (buf: Buffer, bytes: number[], offset = 0) =>
  buf.length >= offset + bytes.length &&
  bytes.every((byte, i) => buf[offset + i] === byte);
const ascii = (text: string) => Array.from(Buffer.from(text, 'latin1'));

const ZIP = [0x50, 0x4b, 0x03, 0x04]; // docx/xlsx/pptx are ZIP containers
const OLE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]; // legacy doc/xls/ppt

/**
 * Checks the first bytes of a file against the type the client declared,
 * so a renamed executable or HTML page cannot be stored as an image or PDF.
 */
const CONTENT_SIGNATURES: Record<string, (buf: Buffer) => boolean> = {
  'image/jpeg': (b) => startsWith(b, [0xff, 0xd8, 0xff]),
  'image/png': (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  'image/gif': (b) => startsWith(b, ascii('GIF87a')) || startsWith(b, ascii('GIF89a')),
  'image/webp': (b) => startsWith(b, ascii('RIFF')) && startsWith(b, ascii('WEBP'), 8),
  'video/mp4': (b) => startsWith(b, ascii('ftyp'), 4),
  'video/quicktime': (b) =>
    ['ftyp', 'moov', 'mdat', 'wide', 'free', 'skip'].some((box) => startsWith(b, ascii(box), 4)),
  'video/webm': (b) => startsWith(b, [0x1a, 0x45, 0xdf, 0xa3]),
  'application/pdf': (b) => startsWith(b, ascii('%PDF-')),
  'application/zip': (b) => startsWith(b, ZIP),
  'application/x-zip-compressed': (b) => startsWith(b, ZIP),
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': (b) => startsWith(b, ZIP),
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': (b) => startsWith(b, ZIP),
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': (b) => startsWith(b, ZIP),
  'application/msword': (b) => startsWith(b, OLE),
  'application/vnd.ms-excel': (b) => startsWith(b, OLE),
  'application/vnd.ms-powerpoint': (b) => startsWith(b, OLE),
};
const TEXT_MIMES = new Set(['text/plain', 'text/csv', 'text/markdown', 'application/json']);
const EXTENSION_MIME: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.zip': 'application/zip',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.doc': 'application/msword',
  '.xls': 'application/vnd.ms-excel',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.txt': 'text/plain',
  '.csv': 'text/csv',
  '.md': 'text/markdown',
  '.json': 'application/json',
};

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly baseDir: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly conversationsService: ConversationsService,
    @Optional()
    private readonly activitiesService?: ActivitiesService,
  ) {
    this.baseDir = path.resolve(
      this.configService.get<string>('UPLOAD_DIR') ??
        path.join(process.cwd(), 'uploads'),
    );
  }

  async onModuleInit(): Promise<void> {
    await fs.mkdir(path.join(this.baseDir, 'files'), { recursive: true });
    await fs.mkdir(path.join(this.baseDir, 'avatars'), { recursive: true });
  }

  classifyFile(
    originalName: string,
    mimeTypeInput: string,
    sizeBytes: number,
  ): { kind: AttachmentMediaKind; mimeType: string } {
    if (!sizeBytes || sizeBytes <= 0) {
      throw new BadRequestException('Uploaded file cannot be empty.');
    }

    const ext = path.extname(originalName).toLowerCase();
    if (BLOCKED_EXTENSIONS.has(ext)) {
      throw new BadRequestException(
        `File extension "${ext}" is not permitted for security reasons.`,
      );
    }

    const mimeType = (mimeTypeInput || 'application/octet-stream')
      .trim()
      .toLowerCase();

    if (IMAGE_MIMES.has(mimeType)) {
      if (sizeBytes > MAX_IMAGE_BYTES) {
        throw new BadRequestException('Image size cannot exceed 10 MB.');
      }
      return { kind: 'image', mimeType };
    }

    if (VIDEO_MIMES.has(mimeType)) {
      if (sizeBytes > MAX_VIDEO_BYTES) {
        throw new BadRequestException('Video size cannot exceed 50 MB.');
      }
      return { kind: 'video', mimeType };
    }

    if (
      DOCUMENT_MIMES.has(mimeType) ||
      (mimeType === 'application/octet-stream' && SAFE_DOC_EXTENSIONS.has(ext))
    ) {
      if (sizeBytes > MAX_DOCUMENT_BYTES) {
        throw new BadRequestException('Document size cannot exceed 25 MB.');
      }
      return { kind: 'document', mimeType };
    }

    throw new BadRequestException(
      `Unsupported file type "${mimeType}". Supported types: Images (JPEG/PNG/GIF/WEBP), Videos (MP4/WEBM/MOV), and Documents (PDF/Office/TXT/CSV/ZIP).`,
    );
  }

  /** Rejects files whose bytes do not match the declared type. */
  assertContentMatchesType(
    mimeType: string,
    originalName: string,
    buffer: Buffer,
  ): void {
    // Documents sent as octet-stream are checked by their extension instead.
    const effectiveMime =
      mimeType === 'application/octet-stream'
        ? EXTENSION_MIME[path.extname(originalName).toLowerCase()]
        : mimeType;

    if (effectiveMime && TEXT_MIMES.has(effectiveMime)) {
      // Plain text never contains NUL bytes; binaries almost always do.
      if (buffer.subarray(0, 8192).includes(0)) {
        throw new BadRequestException('File content does not match its declared text type.');
      }
      return;
    }

    const matches = effectiveMime ? CONTENT_SIGNATURES[effectiveMime] : undefined;
    if (!matches || !matches(buffer)) {
      throw new BadRequestException(
        `File content does not match its declared type "${mimeType}".`,
      );
    }
  }

  async saveConversationFile(
    actorId: string,
    conversationId: string,
    file: UploadedBinaryFile | undefined,
  ): Promise<StoredAttachmentResult> {
    if (!file || !file.buffer) {
      throw new BadRequestException('A file is required.');
    }

    await this.conversationsService.assertOpenConversationMembership(
      actorId,
      conversationId,
    );

    const decodedOriginalName = this.normalizeOriginalName(file.originalname);
    const { kind, mimeType } = this.classifyFile(
      decodedOriginalName,
      file.mimetype,
      file.size,
    );
    this.assertContentMatchesType(mimeType, decodedOriginalName, file.buffer);

    const safeBase = this.sanitizeFileName(decodedOriginalName);
    const storedFileName = `${Date.now()}-${randomBytes(6).toString('hex')}-${safeBase}`;
    const convDir = path.join(this.baseDir, 'files', conversationId);
    await fs.mkdir(convDir, { recursive: true });

    const fullPath = path.join(convDir, storedFileName);
    await fs.writeFile(fullPath, file.buffer);

    const storageKey = `${conversationId}/${storedFileName}`;
    const uploadedAt = new Date();

    await this.activitiesService?.record({
      actorId,
      type: ActivityEventType.FILE_UPLOADED,
      conversationId,
      metadata: {
        kind,
        mimeType,
        sizeBytes: file.size,
      },
      occurredAt: uploadedAt,
    });

    return {
      storageKey,
      kind,
      originalName: decodedOriginalName,
      mimeType,
      sizeBytes: file.size,
      uploadedAt: uploadedAt.toISOString(),
      url: this.signDownloadUrl(storageKey),
    };
  }

  async saveAvatarFile(
    actorId: string,
    file: UploadedBinaryFile | undefined,
  ): Promise<{ url: string }> {
    if (!file || !file.buffer) {
      throw new BadRequestException('An image file is required.');
    }
    const mimeType = (file.mimetype || '').trim().toLowerCase();
    if (!IMAGE_MIMES.has(mimeType)) {
      throw new BadRequestException(
        'Avatar must be a JPEG, PNG, GIF, or WEBP image.',
      );
    }
    if (file.size <= 0 || file.size > MAX_AVATAR_BYTES) {
      throw new BadRequestException('Avatar image cannot exceed 5 MB.');
    }
    this.assertContentMatchesType(mimeType, file.originalname, file.buffer);

    const extMap: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/gif': '.gif',
      'image/webp': '.webp',
    };
    const ext = extMap[mimeType] ?? '.png';
    const fileName = `${actorId}-${Date.now()}-${randomBytes(4).toString('hex')}${ext}`;
    const avatarsDir = path.join(this.baseDir, 'avatars');
    await fs.mkdir(avatarsDir, { recursive: true });
    await fs.writeFile(path.join(avatarsDir, fileName), file.buffer);

    return { url: `/uploads/avatars/${fileName}` };
  }

  async verifyStoredAttachment(
    conversationId: string,
    storageKey: string,
  ): Promise<{ sizeBytes: number; fullPath: string }> {
    const parts = storageKey.split('/');
    if (
      parts.length !== 2 ||
      parts[0] !== conversationId ||
      !/^[a-f\d]{24}$/i.test(parts[0]) ||
      !/^[a-zA-Z0-9._-]+$/.test(parts[1]) ||
      parts[1].includes('..')
    ) {
      throw new BadRequestException('Invalid attachment storage key.');
    }

    const fullPath = path.join(this.baseDir, 'files', parts[0], parts[1]);
    try {
      const stat = await fs.stat(fullPath);
      if (!stat.isFile()) {
        throw new NotFoundException('Uploaded file not found.');
      }
      return { sizeBytes: stat.size, fullPath };
    } catch {
      throw new BadRequestException(
        'Referenced attachment does not exist on the server.',
      );
    }
  }

  async resolveConversationFilePath(
    conversationId: string,
    fileName: string,
  ): Promise<string> {
    if (
      !/^[a-f\d]{24}$/i.test(conversationId) ||
      !/^[a-zA-Z0-9._-]+$/.test(fileName) ||
      fileName.includes('..')
    ) {
      throw new BadRequestException('Invalid file path.');
    }
    const fullPath = path.join(this.baseDir, 'files', conversationId, fileName);
    try {
      const stat = await fs.stat(fullPath);
      if (!stat.isFile()) throw new Error('Not a file');
      return fullPath;
    } catch {
      throw new NotFoundException('File not found.');
    }
  }

  async resolveAvatarFilePath(fileName: string): Promise<string> {
    if (!/^[a-zA-Z0-9._-]+$/.test(fileName) || fileName.includes('..')) {
      throw new BadRequestException('Invalid avatar file name.');
    }
    const fullPath = path.join(this.baseDir, 'avatars', fileName);
    try {
      const stat = await fs.stat(fullPath);
      if (!stat.isFile()) throw new Error('Not a file');
      return fullPath;
    } catch {
      throw new NotFoundException('Avatar not found.');
    }
  }

  signDownloadUrl(storageKey: string, ttlSeconds = 14400): string {
    const expires = Math.floor(Date.now() / 1000) + ttlSeconds;
    const sig = this.computeSignature(storageKey, expires);
    return `/uploads/files/${storageKey}?expires=${expires}&sig=${sig}`;
  }

  verifyDownloadSignature(
    storageKey: string,
    expiresRaw?: string,
    sigRaw?: string,
  ): boolean {
    if (!expiresRaw || !sigRaw) return false;
    const expires = Number(expiresRaw);
    if (!Number.isInteger(expires) || expires <= Math.floor(Date.now() / 1000)) {
      return false;
    }
    if (!/^[a-f0-9]{64}$/i.test(sigRaw)) return false;

    const expected = Buffer.from(
      this.computeSignature(storageKey, expires),
      'hex',
    );
    const provided = Buffer.from(sigRaw, 'hex');
    if (expected.length !== provided.length) return false;
    return timingSafeEqual(expected, provided);
  }

  assertAuthorizedForDownload(
    storageKey: string,
    expires?: string,
    sig?: string,
  ): void {
    if (!this.verifyDownloadSignature(storageKey, expires, sig)) {
      throw new ForbiddenException('Invalid or expired file download link.');
    }
  }

  private computeSignature(storageKey: string, expires: number): string {
    const secret = this.configService.get<string>('AUTH_JWT_SECRET') ?? '';
    return createHmac('sha256', secret)
      .update(`${storageKey}:${expires}`)
      .digest('hex');
  }

  private normalizeOriginalName(rawName: string): string {
    const trimmed = (rawName || 'attachment').trim();
    try {
      // Multer decodes header filenames as latin1 by default; recover UTF-8 Vietnamese names cleanly
      const recovered = Buffer.from(trimmed, 'latin1').toString('utf8');
      if (!recovered.includes('\uFFFD')) {
        return recovered.slice(0, 180);
      }
    } catch {
      // fallback to rawName
    }
    return trimmed.slice(0, 180);
  }

  private sanitizeFileName(name: string): string {
    const ext = path.extname(name).toLowerCase().replace(/[^.a-z0-9]/g, '');
    const stem = path
      .basename(name, path.extname(name))
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .replace(/_+/g, '_')
      .slice(0, 60);
    return `${stem || 'file'}${ext.slice(0, 12)}`;
  }
}
