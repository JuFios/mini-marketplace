import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { saveBlob } from './save-blob';

// jsdom has no object URLs and does not navigate on a click.
const createObjectURL = vi.fn(() => 'blob:fake-url');
const revokeObjectURL = vi.fn();

beforeEach(() => {
  Object.assign(URL, { createObjectURL, revokeObjectURL });
});

afterEach(() => {
  vi.restoreAllMocks();
  createObjectURL.mockClear();
  revokeObjectURL.mockClear();
});

describe('saveBlob', () => {
  it('clicks a download link for the blob, named as asked, then cleans up', () => {
    const clicked: { href: string; download: string; attached: boolean }[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked.push({
        href: this.href,
        download: this.download,
        attached: document.body.contains(this),
      });
    });
    const blob = new Blob(['a,b\r\n'], { type: 'text/csv' });

    saveBlob(blob, 'sales-2026-10-01-2026-10-07.csv');

    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(clicked).toEqual([
      { href: 'blob:fake-url', download: 'sales-2026-10-01-2026-10-07.csv', attached: true },
    ]);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake-url');
    expect(document.querySelector('a[download]')).toBeNull();
  });
});
