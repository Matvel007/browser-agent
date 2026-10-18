import { beforeAll, describe, expect, it } from 'vitest';
import { ATTACHMENT_LIMITS, attachmentKind, attachmentText, formatBytes, messageText, readAttachment } from '../../src/services/attachments';
import { i18n } from '../../src/services/i18n';

beforeAll(async () => { await i18n.init('en'); });

describe('chat attachments', () => {
  it('classifies supported image and text files', () => {
    expect(attachmentKind({ name: 'photo.png', type: 'image/png' })).toBe('image');
    expect(attachmentKind({ name: 'photo.png', type: '' })).toBe('image');
    expect(attachmentKind({ name: 'notes.txt', type: '' })).toBe('text');
    expect(attachmentKind({ name: 'data.json', type: 'application/json' })).toBe('text');
    expect(attachmentKind({ name: 'archive.zip', type: 'application/zip' })).toBeNull();
  });
  it('reads text and image attachments', async () => {
    const text = await readAttachment(new File(['hello'], 'notes.md', { type: 'text/markdown' }));
    expect(text).toMatchObject({ name: 'notes.md', kind: 'text', data: 'hello', mime: 'text/markdown' });
    const image = await readAttachment(new File([new Uint8Array([1, 2, 3])], 'pixel.png', { type: 'image/png' }));
    expect(image.kind).toBe('image');
    expect(image.data).toBe('AQID');
  });
  it('rejects unsupported and binary text files', async () => {
    await expect(readAttachment(new File(['x'], 'a.zip', { type: 'application/zip' }))).rejects.toThrow('text files');
    await expect(readAttachment(new File([new Uint8Array([0, 1, 2])], 'bad.txt', { type: 'text/plain' }))).rejects.toThrow('binary');
  });
  it('rejects files above the per-kind limit', async () => {
    await expect(readAttachment(new File([new Uint8Array(ATTACHMENT_LIMITS.textBytes + 1)], 'big.txt', { type: 'text/plain' }))).rejects.toThrow('exceeds');
  });
  it('formats text attachments for the model and bytes for the UI', () => {
    const attachment = { id: 'a', name: 'notes.txt', mime: 'text/plain', size: 1536, kind: 'text' as const, data: 'line' };
    expect(attachmentText(attachment)).toContain('[Attached file: notes.txt]');
    expect(messageText({ content: 'Question', attachments: [attachment] })).toContain('Question');
    expect(messageText({ content: 'Question', attachments: [attachment] })).toContain('line');
    expect(formatBytes(1536)).toBe('1.5 KiB');
    expect(formatBytes(2 * 1024 * 1024)).toBe('2.0 MiB');
  });
});
