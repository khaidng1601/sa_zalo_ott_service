import { BadRequestException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { ConversationsService } from '../conversations/conversations.service.js';
import { StorageService } from './storage.service.js';

const hex = (value: string) => Buffer.from(value, 'hex');
const text = (value: string) => Buffer.from(value);

describe('StorageService file checks', () => {
  const service = new StorageService(
    { get: () => undefined } as unknown as ConfigService,
    {} as ConversationsService,
  );

  describe('classifyFile', () => {
    it('sorts files into image, video and document', () => {
      expect(service.classifyFile('a.png', 'image/png', 10).kind).toBe('image');
      expect(service.classifyFile('a.mp4', 'video/mp4', 10).kind).toBe('video');
      expect(service.classifyFile('a.pdf', 'application/pdf', 10).kind).toBe('document');
      expect(service.classifyFile('a.docx', 'application/octet-stream', 10).kind).toBe('document');
    });

    it('enforces the per-type size limits', () => {
      expect(() => service.classifyFile('a.png', 'image/png', 10 * 1024 * 1024 + 1)).toThrow(BadRequestException);
      expect(() => service.classifyFile('a.pdf', 'application/pdf', 25 * 1024 * 1024 + 1)).toThrow(BadRequestException);
      expect(() => service.classifyFile('a.mp4', 'video/mp4', 50 * 1024 * 1024 + 1)).toThrow(BadRequestException);
    });

    it('blocks dangerous extensions and unknown types', () => {
      expect(() => service.classifyFile('page.html', 'text/plain', 10)).toThrow(BadRequestException);
      expect(() => service.classifyFile('run.exe', 'application/pdf', 10)).toThrow(BadRequestException);
      expect(() => service.classifyFile('a.bin', 'application/x-msdownload', 10)).toThrow(BadRequestException);
      expect(() => service.classifyFile('empty.png', 'image/png', 0)).toThrow(BadRequestException);
    });
  });

  describe('assertContentMatchesType', () => {
    it.each([
      ['image/png', 'a.png', hex('89504e470d0a1a0a0000')],
      ['image/jpeg', 'a.jpg', hex('ffd8ffe000104a464946')],
      ['image/gif', 'a.gif', text('GIF89a....')],
      ['image/webp', 'a.webp', Buffer.concat([text('RIFF'), hex('00000000'), text('WEBPVP8 ')])],
      ['video/mp4', 'a.mp4', Buffer.concat([hex('00000018'), text('ftypisom')])],
      ['video/webm', 'a.webm', hex('1a45dfa39f4286')],
      ['application/pdf', 'a.pdf', text('%PDF-1.7\n')],
      ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'a.docx', hex('504b030414000600')],
      ['application/msword', 'a.doc', hex('d0cf11e0a1b11ae1')],
      ['application/octet-stream', 'a.xlsx', hex('504b030414000600')],
      ['text/plain', 'notes.txt', text('Xin chào 👋')],
    ])('accepts a real %s file', (mime, name, bytes) => {
      expect(() => service.assertContentMatchesType(mime, name, bytes)).not.toThrow();
    });

    it.each([
      ['an executable renamed to .png', 'image/png', 'photo.png', hex('4d5a90000300000004000000')],
      ['an HTML page sent as a PDF', 'application/pdf', 'doc.pdf', text('<html><script>alert(1)</script>')],
      ['a PNG sent as a video', 'video/mp4', 'clip.mp4', hex('89504e470d0a1a0a0000')],
      ['a binary sent as text', 'text/plain', 'notes.txt', hex('4d5a900003000000')],
      ['a .docx that is not a ZIP', 'application/octet-stream', 'report.docx', text('not a zip file')],
    ])('rejects %s', (_label, mime, name, bytes) => {
      expect(() => service.assertContentMatchesType(mime, name, bytes)).toThrow(BadRequestException);
    });
  });
});
