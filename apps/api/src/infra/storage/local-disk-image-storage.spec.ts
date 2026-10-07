import { mkdtemp, readFile, readdir, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AppConfigService } from '../../config/app-config.service';
import { LocalDiskImageStorage } from './local-disk-image-storage';

describe('LocalDiskImageStorage', () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'uploads-'));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  const storageIn = (dir: string) =>
    new LocalDiskImageStorage({ uploadDir: dir } as AppConfigService);

  it('writes the file under a generated name and returns its URL path', async () => {
    const storage = storageIn(directory);

    const url = await storage.save(Buffer.from('image-bytes'), 'png');

    expect(url).toMatch(/^\/uploads\/[0-9a-f-]{36}\.png$/);
    const [file] = await readdir(directory);
    expect(url).toBe(`/uploads/${file}`);
    expect((await readFile(join(directory, file))).toString()).toBe('image-bytes');
  });

  it('creates the directory when it does not exist yet', async () => {
    const storage = storageIn(join(directory, 'nested', 'dir'));

    await expect(storage.save(Buffer.from('x'), 'webp')).resolves.toMatch(/\.webp$/);
  });

  it('never reuses a name', async () => {
    const storage = storageIn(directory);

    const urls = await Promise.all([1, 2, 3].map(() => storage.save(Buffer.from('x'), 'jpg')));

    expect(new Set(urls).size).toBe(3);
  });

  describe('list', () => {
    const NAME = '3f2a9c1d-5b7e-4c1a-9d3e-0a1b2c3d4e5f.png';

    it('reports every saved image with the time it was written', async () => {
      const storage = storageIn(directory);
      const url = await storage.save(Buffer.from('x'), 'jpg');
      const written = new Date('2026-01-02T03:04:05.000Z');
      await utimes(join(directory, url.replace('/uploads/', '')), written, written);

      await expect(storage.list()).resolves.toEqual([{ url, modifiedAt: written }]);
    });

    it('is empty before the first upload, when the directory does not exist yet', async () => {
      const storage = storageIn(join(directory, 'not-yet'));

      await expect(storage.list()).resolves.toEqual([]);
    });

    it('leaves out anything that is not a file this storage generated', async () => {
      const storage = storageIn(directory);
      await writeFile(join(directory, NAME), 'x');
      await writeFile(join(directory, '.gitkeep'), '');
      await writeFile(join(directory, 'notes.txt'), 'x');
      await writeFile(join(directory, 'photo.png'), 'x');
      await writeFile(join(directory, `${NAME}.bak`), 'x');

      const urls = (await storage.list()).map((image) => image.url);

      expect(urls).toEqual([`/uploads/${NAME}`]);
    });
  });

  describe('delete', () => {
    it('removes the file behind a URL that save returned', async () => {
      const storage = storageIn(directory);
      const url = await storage.save(Buffer.from('x'), 'png');

      await storage.delete(url);

      expect(await readdir(directory)).toEqual([]);
    });

    it('does not mind a file that is already gone', async () => {
      const storage = storageIn(directory);
      const url = await storage.save(Buffer.from('x'), 'png');
      await storage.delete(url);

      await expect(storage.delete(url)).resolves.toBeUndefined();
    });

    it('ignores a URL that is not one of its own, and cannot be led out of its directory', async () => {
      const NAME = '3f2a9c1d-5b7e-4c1a-9d3e-0a1b2c3d4e5f.png';
      // A file with a perfectly good generated name, but in the directory above the storage's.
      await writeFile(join(directory, NAME), 'x');
      const storage = storageIn(join(directory, 'uploads'));
      const kept = await storage.save(Buffer.from('x'), 'png');

      for (const url of [
        `https://example.com/uploads/${NAME}`,
        `/uploads/../${NAME}`,
        `/uploads/..%2F${NAME}`,
        `uploads/${NAME}`,
        '/uploads/',
        '/uploads/notes.txt',
        '',
      ]) {
        await storage.delete(url);
      }

      expect(await readdir(directory)).toContain(NAME);
      expect((await storage.list()).map((image) => image.url)).toEqual([kept]);
    });
  });
});
