import { createdAtRange } from './created-at-range';

describe('createdAtRange', () => {
  it('has no bounds without a filter', () => {
    expect(createdAtRange()).toBeUndefined();
  });

  it('starts at the beginning of `from` and ends after the whole `to` day, in UTC', () => {
    expect(createdAtRange('2026-10-01', '2026-10-03')).toEqual({
      gte: new Date('2026-10-01T00:00:00.000Z'),
      lt: new Date('2026-10-04T00:00:00.000Z'),
    });
  });

  it('accepts a single bound', () => {
    expect(createdAtRange('2026-10-01')).toEqual({ gte: new Date('2026-10-01T00:00:00.000Z') });
    expect(createdAtRange(undefined, '2026-10-01')).toEqual({
      lt: new Date('2026-10-02T00:00:00.000Z'),
    });
  });

  it('includes a single day when both bounds are equal', () => {
    expect(createdAtRange('2026-10-05', '2026-10-05')).toEqual({
      gte: new Date('2026-10-05T00:00:00.000Z'),
      lt: new Date('2026-10-06T00:00:00.000Z'),
    });
  });

  it('rolls over month, year and leap-day ends', () => {
    expect(createdAtRange(undefined, '2026-12-31')?.lt).toEqual(
      new Date('2027-01-01T00:00:00.000Z'),
    );
    expect(createdAtRange(undefined, '2028-02-28')?.lt).toEqual(
      new Date('2028-02-29T00:00:00.000Z'),
    );
    expect(createdAtRange(undefined, '2028-02-29')?.lt).toEqual(
      new Date('2028-03-01T00:00:00.000Z'),
    );
  });
});
