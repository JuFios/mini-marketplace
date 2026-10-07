import { ProductImagesService } from './product-images.service';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const file = (buffer: Buffer, originalname = 'photo.png', mimetype = 'image/png') =>
  ({ buffer, originalname, mimetype }) as Express.Multer.File;

function setup() {
  const save = jest.fn().mockResolvedValue('/uploads/abc.png');
  const storage = { save, list: jest.fn(), delete: jest.fn() };
  return { service: new ProductImagesService(storage), save };
}

describe('ProductImagesService', () => {
  it('stores a real image and returns its URL', async () => {
    const { service, save } = setup();

    await expect(service.upload(file(PNG))).resolves.toEqual({ url: '/uploads/abc.png' });
    expect(save).toHaveBeenCalledWith(PNG, 'png');
  });

  it('rejects a file whose extension and declared type claim an image but whose content is not', async () => {
    const { service, save } = setup();
    const spoofed = file(Buffer.from('<script>alert(1)</script>'), 'evil.png', 'image/png');

    await expect(service.upload(spoofed)).rejects.toMatchObject({
      httpStatus: 415,
      code: 'UNSUPPORTED_MEDIA_TYPE',
    });
    expect(save).not.toHaveBeenCalled();
  });

  it('stores an image whose name and declared type are wrong, by content alone', async () => {
    const { service, save } = setup();

    await service.upload(file(PNG, 'notes.txt', 'text/plain'));

    expect(save).toHaveBeenCalledWith(PNG, 'png');
  });

  it('asks for the file when none was sent', async () => {
    const { service } = setup();

    await expect(service.upload(undefined)).rejects.toMatchObject({
      httpStatus: 400,
      code: 'VALIDATION_FAILED',
    });
  });
});
