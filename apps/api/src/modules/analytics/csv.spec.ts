import { csvCell, csvRow } from './csv';

describe('csvCell', () => {
  it('leaves plain text and numbers as they are', () => {
    expect(csvCell('Wireless Mouse')).toBe('Wireless Mouse');
    expect(csvCell(12)).toBe('12');
    expect(csvCell('')).toBe('');
    expect(csvCell('19.99')).toBe('19.99');
  });

  it.each([
    ['a,b', '"a,b"'],
    ['say "hi"', '"say ""hi"""'],
    ['line1\nline2', '"line1\nline2"'],
    ['line1\r\nline2', '"line1\r\nline2"'],
    ['a\rb', '"a\rb"'],
    ['""', '""""""'],
  ])('quotes %j as %j', (input, expected) => {
    expect(csvCell(input)).toBe(expected);
  });

  it.each(['=1+1', '+1', '-1', '@SUM(A1)', '\tTAB', '\rCR'])(
    'neutralises the formula trigger in %j with a leading apostrophe',
    (input) => {
      expect(csvCell(input).replace(/^"|"$/g, '')).toBe(`'${input}`);
    },
  );

  it('neutralises first, then quotes, so a formula with commas and quotes stays inert', () => {
    expect(csvCell('=HYPERLINK("http://evil","x")')).toBe(`"'=HYPERLINK(""http://evil"",""x"")"`);
  });

  it('only looks at the first character', () => {
    expect(csvCell('a=b')).toBe('a=b');
    expect(csvCell('5-3')).toBe('5-3');
    expect(csvCell('x@y.com')).toBe('x@y.com');
  });

  it('does not touch numbers, even negative ones', () => {
    expect(csvCell(-5)).toBe('-5');
  });
});

describe('csvRow', () => {
  it('joins cells with commas and ends the record with CRLF', () => {
    expect(csvRow(['id', 'a,b', 3])).toBe('id,"a,b",3\r\n');
  });
});
