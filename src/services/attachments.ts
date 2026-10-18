import { Attachment, ChatMessage } from '../types';
import { tr } from './i18n';

export const ATTACHMENT_LIMITS = {
  files: 8,
  imageBytes: 2 * 1024 * 1024,
  textBytes: 512 * 1024,
  totalBytes: 10 * 1024 * 1024,
} as const;

const IMAGE_MIME = /^image\/(?:png|jpe?g|webp|gif)$/i;
const IMAGE_EXT = /\.(?:png|jpe?g|webp|gif)$/i;
const TEXT_MIME = /^(?:text\/|application\/(?:json|ld\+json|x-ndjson|xml|javascript|x-yaml|yaml|sql|x-sh|x-httpd-php|x-php|toml|graphql|rtf)$)/i;
const TEXT_EXT = /\.(?:txt|md|markdown|json|jsonc|csv|tsv|log|xml|yaml|yml|toml|ini|cfg|conf|env|js|jsx|mjs|cjs|ts|tsx|css|scss|less|html?|svg|sql|sh|bash|zsh|py|rb|go|rs|java|kt|kts|c|h|cpp|hpp|cc|cs|php|vue|svelte|astro|pl|pm|r|swift|dart|lua|vim|graphql|gql|proto|dockerfile|makefile)$/i;

export function attachmentKind(file: { name: string; type: string }): Attachment['kind'] | null {
  if (IMAGE_MIME.test(file.type) || IMAGE_EXT.test(file.name)) return 'image';
  if (TEXT_MIME.test(file.type) || TEXT_EXT.test(file.name)) return 'text';
  return null;
}

function imageMime(file: { name: string; type: string }): string {
  if (/^image\/jpe?g$/i.test(file.type)) return 'image/jpeg';
  if (IMAGE_MIME.test(file.type)) return file.type.toLowerCase();
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  if (extension === 'webp') return 'image/webp';
  if (extension === 'gif') return 'image/gif';
  return 'image/png';
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

export function attachmentDataUrl(attachment: Attachment): string {
  return attachment.kind === 'image' ? `data:${attachment.mime};base64,${attachment.data}` : '';
}

export function attachmentText(attachment: Attachment): string {
  if (attachment.kind !== 'text') return '';
  return `[Attached file: ${attachment.name}]\n${attachment.data}\n[End of attached file: ${attachment.name}]`;
}

export function messageText(message: Pick<ChatMessage, 'content' | 'attachments'>): string {
  return [message.content, ...(message.attachments || []).map(attachmentText)].filter(Boolean).join('\n\n');
}

async function imageBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 0x8000) chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 0x8000)));
  return btoa(chunks.join(''));
}

export async function readAttachment(file: File): Promise<Attachment> {
  const kind = attachmentKind(file);
  if (!kind) throw new Error(tr('Поддерживаются изображения PNG, JPEG, WebP, GIF и текстовые файлы.', 'Only PNG, JPEG, WebP, GIF images and text files are supported.'));
  const limit = kind === 'image' ? ATTACHMENT_LIMITS.imageBytes : ATTACHMENT_LIMITS.textBytes;
  if (file.size > limit) throw new Error(tr(`Файл «${file.name}» больше ${formatBytes(limit)}.`, `File "${file.name}" exceeds ${formatBytes(limit)}.`));
  if (kind === 'image') return { id: crypto.randomUUID(), name: file.name, mime: imageMime(file), size: file.size, kind, data: await imageBase64(file) };
  const data = await file.text();
  if (data.includes('\u0000')) throw new Error(tr(`Файл «${file.name}» выглядит двоичным.`, `File "${file.name}" looks binary.`));
  return { id: crypto.randomUUID(), name: file.name, mime: file.type || 'text/plain', size: file.size, kind, data };
}
