import { createHash } from 'node:crypto';

export const MEDIA_POLICY = Object.freeze({
  maxBytes: 25 * 1024 * 1024,
  allowed: Object.freeze({
    'image/jpeg': ['jpg', 'jpeg'],
    'image/png': ['png'],
    'image/webp': ['webp'],
    'image/avif': ['avif']
  })
});

export function validateUpload({ ownerAccountId, filename, mimeType, bytes }) {
  if (!ownerAccountId) throw new Error('owner required');
  if (!(bytes instanceof Uint8Array) || bytes.length === 0 || bytes.length > MEDIA_POLICY.maxBytes) throw new Error('invalid media size');
  const extension = filename.split('.').pop()?.toLowerCase();
  if (!MEDIA_POLICY.allowed[mimeType]?.includes(extension)) throw new Error('MIME_EXTENSION_MISMATCH');
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  return { sha256, byteSize: bytes.length, mimeType, extension, safetyStatus: 'PENDING' };
}

export function serialArtworkCommitment(entries) {
  if (!Array.isArray(entries) || entries.length === 0) throw new Error('artwork entries required');
  const normalized = entries.map((entry, index) => {
    const expected = index + 1;
    if (entry.tokenId !== expected || !/^[0-9a-f]{64}$/.test(entry.sha256)) throw new Error('non-contiguous or invalid serial artwork');
    return `${expected}:${entry.sha256}`;
  });
  return createHash('sha256').update(normalized.join('\n')).digest('hex');
}
