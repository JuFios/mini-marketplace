export type ImageExtension = 'png' | 'jpg' | 'webp';

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];

function startsWith(buffer: Buffer, signature: number[], offset = 0): boolean {
  return (
    buffer.length >= offset + signature.length &&
    signature.every((byte, index) => buffer[offset + index] === byte)
  );
}

/**
 * Identifies an image by its leading bytes. The client-supplied file name and `Content-Type`
 * are ignored: both are trivially forged, the signature of the actual content is not.
 */
export function detectImageType(buffer: Buffer): ImageExtension | null {
  if (startsWith(buffer, PNG_SIGNATURE)) return 'png';
  if (startsWith(buffer, JPEG_SIGNATURE)) return 'jpg';
  // WebP is a RIFF container: "RIFF" <4-byte size> "WEBP".
  if (
    startsWith(buffer, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(buffer, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return 'webp';
  }
  return null;
}
