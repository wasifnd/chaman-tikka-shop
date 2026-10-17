import { describe, expect, it } from 'vitest';
import { pakistaniPhone } from './phone';

describe('pakistaniPhone', () => {
  it.each([
    ['03001234567', '03001234567'],
    ['0300-123 4567', '03001234567'],
    ['  03451234567  ', '03451234567'],
    ['+923001234567', '+923001234567'],
    ['+92 300 1234567', '+923001234567'],
  ])('accepts and normalises %s', (input, expected) => {
    expect(pakistaniPhone.parse(input)).toBe(expected);
  });

  it.each([
    '',
    '12345',
    '0300123456', // one digit short
    '030012345678', // one digit long
    '02001234567', // not a mobile prefix
    '+913001234567', // wrong country
    '03001234567x',
    'abcdefghijk',
    "0300'; DROP TABLE users;--",
  ])('rejects %j', (input) => {
    expect(pakistaniPhone.safeParse(input).success).toBe(false);
  });
});
