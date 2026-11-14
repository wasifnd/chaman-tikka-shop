import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  extractCode,
  incomingTexts,
  isSignedByMeta,
  verificationConfig,
  verificationMessage,
  whatsappLink,
} from './whatsapp';

const full = {
  WHATSAPP_BUSINESS_NUMBER: '+92 300 0000000',
  WHATSAPP_APP_SECRET: 'app-secret',
  WHATSAPP_VERIFY_TOKEN: 'verify-token',
};

describe('verificationConfig', () => {
  it('uses WhatsApp when the number, app secret and verify token are all set', () => {
    expect(verificationConfig({ ...full, NODE_ENV: 'production' })).toEqual({
      mode: 'whatsapp',
      businessNumber: '923000000000',
      appSecret: 'app-secret',
      verifyToken: 'verify-token',
      reply: null,
    });
  });

  it('adds the thank-you reply only when both reply settings are present', () => {
    const config = verificationConfig({
      ...full,
      WHATSAPP_ACCESS_TOKEN: 'token',
      WHATSAPP_PHONE_NUMBER_ID: '123',
    });
    expect(config).toMatchObject({ reply: { accessToken: 'token', phoneNumberId: '123' } });
    expect(verificationConfig({ ...full, WHATSAPP_ACCESS_TOKEN: 'token' })).toMatchObject({
      reply: null,
    });
  });

  it('falls back to the test button in development', () => {
    expect(verificationConfig({ NODE_ENV: 'development' })).toEqual({ mode: 'dev' });
    expect(verificationConfig({})).toEqual({ mode: 'dev' });
  });

  it('never offers the test button on a live site, even half set up', () => {
    expect(verificationConfig({ NODE_ENV: 'production' })).toEqual({ mode: 'off' });
    expect(
      verificationConfig({ NODE_ENV: 'production', WHATSAPP_BUSINESS_NUMBER: '923000000000' }),
    ).toEqual({ mode: 'off' });
  });
});

describe('codes and links', () => {
  it('builds a WhatsApp link with the message ready to send', () => {
    const link = whatsappLink('923000000000', '123456');
    expect(link).toBe('https://wa.me/923000000000?text=Chaman%20Tikka%20Shop%20code%3A%20123456');
    expect(decodeURIComponent(link.split('text=')[1] ?? '')).toBe(verificationMessage('123456'));
  });

  it.each([
    ['Chaman Tikka Shop code: 123456', '123456'],
    ['123456', '123456'],
    ['hi! my code is 654321 thanks', '654321'],
  ])('finds the code in %j', (text, code) => {
    expect(extractCode(text)).toBe(code);
  });

  it.each(['', 'hello', '12345', '1234567', 'call 03001234567'])('finds no code in %j', (text) => {
    expect(extractCode(text)).toBeNull();
  });
});

describe('isSignedByMeta', () => {
  const body = '{"object":"whatsapp_business_account"}';
  const sign = (secret: string) =>
    `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;

  it('accepts a call signed with our app secret', () => {
    expect(isSignedByMeta(body, sign('app-secret'), 'app-secret')).toBe(true);
  });

  it('rejects a missing, malformed, wrongly signed or altered call', () => {
    expect(isSignedByMeta(body, null, 'app-secret')).toBe(false);
    expect(isSignedByMeta(body, 'md5=abc', 'app-secret')).toBe(false);
    expect(isSignedByMeta(body, 'sha256=abc', 'app-secret')).toBe(false);
    expect(isSignedByMeta(body, sign('other-secret'), 'app-secret')).toBe(false);
    expect(isSignedByMeta(`${body} `, sign('app-secret'), 'app-secret')).toBe(false);
  });
});

describe('incomingTexts', () => {
  const payload = (messages: unknown[]) => ({
    object: 'whatsapp_business_account',
    entry: [{ changes: [{ field: 'messages', value: { messages } }] }],
  });

  it('reads the sender and text of each message, in our stored phone form', () => {
    expect(
      incomingTexts(
        payload([
          { from: '923001234567', type: 'text', text: { body: 'Chaman Tikka Shop code: 111111' } },
          { from: '923451234567', type: 'text', text: { body: 'hello' } },
        ]),
      ),
    ).toEqual([
      { phone: '03001234567', text: 'Chaman Tikka Shop code: 111111' },
      { phone: '03451234567', text: 'hello' },
    ]);
  });

  it('ignores pictures, delivery receipts, foreign numbers and junk', () => {
    expect(
      incomingTexts(
        payload([
          { from: '923001234567', type: 'image', image: {} },
          { from: '14155550100', type: 'text', text: { body: '111111' } },
          { from: 923001234567, type: 'text', text: { body: '111111' } },
          { type: 'text', text: { body: '111111' } },
          null,
        ]),
      ),
    ).toEqual([]);
    expect(incomingTexts({ entry: [{ changes: [{ value: { statuses: [{}] } }] }] })).toEqual([]);
    expect(incomingTexts(null)).toEqual([]);
    expect(incomingTexts({ entry: 'nope' })).toEqual([]);
    expect(incomingTexts([1, 2])).toEqual([]);
  });
});
