import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
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
});
