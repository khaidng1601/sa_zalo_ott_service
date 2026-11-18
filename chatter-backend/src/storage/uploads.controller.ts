import {
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import * as path from 'node:path';
import { AuthGuard } from '../auth/auth.guard.js';
import type { AuthenticatedRequest } from '../auth/auth.guard.js';
import { AuthService } from '../auth/auth.service.js';
import { AuthTokenService } from '../auth/auth-token.service.js';
import { ConversationsService } from '../conversations/conversations.service.js';
import {
  StorageService,
  type StoredAttachmentResult,
  type UploadedBinaryFile,
} from './storage.service.js';

const INLINE_SAFE_EXTS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.webp',
  '.mp4',
  '.webm',
  '.mov',
  '.pdf',
]);

@Controller('uploads')
export class UploadsController {
  constructor(
    private readonly storageService: StorageService,
    private readonly authTokenService: AuthTokenService,
    private readonly authService: AuthService,
    private readonly conversationsService: ConversationsService,
  ) {}

  @Post('conversation/:conversationId')
  @UseGuards(AuthGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 50 * 1024 * 1024 },
    }),
  )
  uploadConversationAttachment(
    @Req() req: AuthenticatedRequest,
    @Param('conversationId') conversationId: string,
    @UploadedFile() file?: UploadedBinaryFile,
  ): Promise<StoredAttachmentResult> {
    if (!req.user) {
      throw new ForbiddenException('Authentication is required.');
    }
    return this.storageService.saveConversationFile(
      req.user.id,
      conversationId,
      file,
    );
  }

  @Post('avatar')
  @UseGuards(AuthGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  uploadAvatar(
    @Req() req: AuthenticatedRequest,
    @UploadedFile() file?: UploadedBinaryFile,
  ): Promise<{ url: string }> {
    if (!req.user) {
      throw new ForbiddenException('Authentication is required.');
    }
    return this.storageService.saveAvatarFile(req.user.id, file);
  }

  @Get('avatars/:fileName')
  async streamAvatar(
    @Param('fileName') fileName: string,
    @Res() res: Response,
  ): Promise<void> {
    const fullPath = await this.storageService.resolveAvatarFilePath(fileName);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.sendFile(fullPath);
  }

  @Get('files/:conversationId/:fileName')
  async streamConversationFile(
    @Param('conversationId') conversationId: string,
    @Param('fileName') fileName: string,
    @Query('expires') expires: string | undefined,
    @Query('sig') sig: string | undefined,
    @Query('download') download: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const storageKey = `${conversationId}/${fileName}`;
    const hasValidSig = this.storageService.verifyDownloadSignature(
      storageKey,
      expires,
      sig,
    );

    if (!hasValidSig) {
      const authHeader = req.headers.authorization;
      const match =
        typeof authHeader === 'string'
          ? /^Bearer\s+([^\s]+)$/i.exec(authHeader)
          : null;
      if (!match) {
        throw new ForbiddenException(
          'Valid signed URL or Bearer token is required to access this file.',
        );
      }
      try {
        const claims = this.authTokenService.verify(match[1]);
        const user = await this.authService.getAuthenticatedUser(claims.sub);
        await this.conversationsService.assertOpenConversationMembership(
          user.id,
          conversationId,
        );
      } catch {
        throw new ForbiddenException('Not authorized to access this file.');
      }
    }

    const fullPath = await this.storageService.resolveConversationFilePath(
      conversationId,
      fileName,
    );

    const ext = path.extname(fileName).toLowerCase();
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    if (download === '1' || !INLINE_SAFE_EXTS.has(ext)) {
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${fileName.replace(/"/g, '')}"`,
      );
    }
    res.sendFile(fullPath);
  }
}
