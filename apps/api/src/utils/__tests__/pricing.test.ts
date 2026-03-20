import {
  calculatePrice,
  calculateUntilClosing,
  generateAuthCode,
  getDurationOptions,
} from '../pricing';

describe('calculatePrice', () => {
  const RATE = 300;

  test.each([
    [0, 0],
    [5, 25],
    [10, 50],
    [20, 100],
    [30, 150],
    [40, 200],
    [60, 300],
  ])('%dm at 300/hr = %d KES', (minutes, expected) => {
    expect(calculatePrice(minutes, RATE)).toBe(expected);
  });

  test('60m at 600/hr = 600 KES', () => {
    expect(calculatePrice(60, 600)).toBe(600);
  });
});

describe('calculateUntilClosing', () => {
  test('2 hours before closing returns 120', () => {
    const closing = '22:00';
    const now = new Date();
    now.setHours(20, 0, 0, 0);
    expect(calculateUntilClosing(now, closing)).toBe(120);
  });

  test('past closing returns 0', () => {
    const closing = '22:00';
    const now = new Date();
    now.setHours(23, 0, 0, 0);
    expect(calculateUntilClosing(now, closing)).toBe(0);
  });
});

describe('generateAuthCode', () => {
  test('returns 6 characters', () => {
    expect(generateAuthCode()).toHaveLength(6);
  });

  test('only alphanumeric characters', () => {
    expect(generateAuthCode()).toMatch(/^[A-Z0-9]{6}$/);
  });

  test('generates unique codes', () => {
    const codes = new Set(Array.from({ length: 100 }, () => generateAuthCode()));
    expect(codes.size).toBeGreaterThan(90);
  });
});

describe('getDurationOptions', () => {
  test('returns 6 options', () => {
    expect(getDurationOptions(300)).toHaveLength(6);
  });

  test('correct prices at 300/hr', () => {
    const options = getDurationOptions(300);
    expect(options).toEqual([
      { minutes: 5, price: 25 },
      { minutes: 10, price: 50 },
      { minutes: 20, price: 100 },
      { minutes: 30, price: 150 },
      { minutes: 40, price: 200 },
      { minutes: 60, price: 300 },
    ]);
  });
});
