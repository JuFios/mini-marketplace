import { escapeLike } from './escape-like';

describe('escapeLike', () => {
  it.each([
    ['100%', '100\\%'],
    ['a_b', 'a\\_b'],
    ['back\\slash', 'back\\\\slash'],
    ['%_\\', '\\%\\_\\\\'],
    ['plain text', 'plain text'],
    ['', ''],
  ])('turns %j into %j', (input, expected) => {
    expect(escapeLike(input)).toBe(expected);
  });
});
