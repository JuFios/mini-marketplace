import { detectImageType } from './image-type';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]);
const webp = (fourCc: string): Buffer =>
  Buffer.concat([
    Buffer.from('RIFF'),
    Buffer.from([0x24, 0, 0, 0]),
    Buffer.from(fourCc),
    Buffer.alloc(8),
  ]);

describe('detectImageType', () => {
  it.each([
    ['PNG', PNG, 'png'],
    ['JPEG', JPEG, 'jpg'],
    ['WebP', webp('WEBP'), 'webp'],
  ])('recognises %s by its signature', (_label, content, extension) => {
    expect(detectImageType(content)).toBe(extension);
  });

  it.each([
    ['plain text pretending to be an image', Buffer.from('hello, I am definitely a PNG')],
    ['an HTML document', Buffer.from('<html><script>alert(1)</script></html>')],
    ['a GIF', Buffer.from('GIF89a......')],
    ['a RIFF file that is not WebP (WAV)', webp('WAVE')],
    ['an SVG', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')],
    ['a truncated PNG signature', PNG.subarray(0, 5)],
    ['an empty file', Buffer.alloc(0)],
  ])('rejects %s', (_label, content) => {
    expect(detectImageType(content)).toBeNull();
  });
});
