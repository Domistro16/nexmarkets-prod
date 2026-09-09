import { createHash } from 'node:crypto';

export const MEDIA_POLICY = Object.freeze({
  maxBytes: 25 * 1024 * 1024,
  minDimension: 64,
  maxDimension: 16_384,
  maxPixels: 100_000_000,
  allowed: Object.freeze({
    'image/jpeg': ['jpg', 'jpeg'],
    'image/png': ['png'],
    'image/webp': ['webp'],
    'image/avif': ['avif']
  })
});

function ascii(bytes, offset, length) {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

function uint24le(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function inspectPng(bytes) {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 24 || !signature.every((value, index) => bytes[index] === value) || ascii(bytes, 12, 4) !== 'IHDR') return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { mimeType: 'image/png', width: view.getUint32(16), height: view.getUint32(20) };
}

function inspectJpeg(bytes) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const dimensions = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  let offset = 2;
  while (offset + 8 < bytes.length) {
    while (offset < bytes.length && bytes[offset] !== 0xff) offset += 1;
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) break;
    const marker = bytes[offset++];
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) break;
    const length = view.getUint16(offset);
    if (length < 2 || offset + length > bytes.length) break;
    if (dimensions.has(marker) && length >= 7) return { mimeType: 'image/jpeg', height: view.getUint16(offset + 3), width: view.getUint16(offset + 5) };
    offset += length;
  }
  return null;
}

function inspectWebp(bytes) {
  if (bytes.length < 30 || ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WEBP') return null;
  const type = ascii(bytes, 12, 4);
  if (type === 'VP8X') return { mimeType: 'image/webp', width: uint24le(bytes, 24) + 1, height: uint24le(bytes, 27) + 1 };
  if (type === 'VP8L' && bytes[20] === 0x2f) {
    return {
      mimeType: 'image/webp',
      width: 1 + bytes[21] + ((bytes[22] & 0x3f) << 8),
      height: 1 + ((bytes[22] & 0xc0) >> 6) + (bytes[23] << 2) + ((bytes[24] & 0x0f) << 10)
    };
  }
  if (type === 'VP8 ' && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { mimeType: 'image/webp', width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff };
  }
  return null;
}

function inspectAvif(bytes) {
  if (bytes.length < 32 || ascii(bytes, 4, 4) !== 'ftyp') return null;
  const brands = ascii(bytes, 8, Math.min(56, bytes.length - 8));
  if (!/(?:avif|avis|mif1)/.test(brands)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let offset = 4; offset + 12 <= bytes.length; offset += 1) {
    if (ascii(bytes, offset, 4) === 'ispe') return { mimeType: 'image/avif', width: view.getUint32(offset + 4), height: view.getUint32(offset + 8) };
  }
  return null;
}

export function inspectImageBytes({ bytes, mimeType }) {
  if (!(bytes instanceof Uint8Array) || bytes.length === 0 || bytes.length > MEDIA_POLICY.maxBytes) throw new Error('INVALID_MEDIA_SIZE');
  const image = inspectPng(bytes) || inspectJpeg(bytes) || inspectWebp(bytes) || inspectAvif(bytes);
  if (!image || image.mimeType !== mimeType) throw new Error('MIME_CONTENT_MISMATCH');
  if (!Number.isInteger(image.width) || !Number.isInteger(image.height)
    || image.width < MEDIA_POLICY.minDimension || image.height < MEDIA_POLICY.minDimension
    || image.width > MEDIA_POLICY.maxDimension || image.height > MEDIA_POLICY.maxDimension
    || image.width * image.height > MEDIA_POLICY.maxPixels) throw new Error('INVALID_IMAGE_DIMENSIONS');
  return {
    ...image,
    byteSize: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex')
  };
}

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
