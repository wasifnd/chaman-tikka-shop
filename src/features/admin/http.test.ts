import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requireSession } from '@/lib/auth/session';
import { AppError } from '@/lib/errors';
import { parseId, requireAdmin } from './http';

vi.mock('@/lib/auth/session', () => ({ requireSession: vi.fn() }));

const ID = '11111111-1111-4111-8111-111111111111';

beforeEach(() => {
  vi.mocked(requireSession).mockReset();
});

describe('parseId', () => {
  it('passes a real id through', () => {
    expect(parseId(ID, 'NOT_FOUND', 'Missing')).toBe(ID);
  });

  it.each(['', 'not-a-uuid', '123', ID + 'x', "1' OR '1'='1"])(
    'treats %j as "not found"',
    (value) => {
      expect(() => parseId(value, 'NOT_FOUND', 'Missing')).toThrow(AppError);
      try {
        parseId(value, 'NOT_FOUND', 'Missing');
      } catch (error) {
        expect(error).toMatchObject({ code: 'NOT_FOUND', status: 404, message: 'Missing' });
      }
    },
  );
});

describe('requireAdmin', () => {
  const user = { userId: 'u', email: 'a@b.pk', role: 'ADMIN' as const };

  it('asks for an admin session', async () => {
    vi.mocked(requireSession).mockResolvedValue(user);
    await expect(requireAdmin(new Request('http://shop.test/api/x'))).resolves.toBe(user);
    expect(requireSession).toHaveBeenCalledWith(['ADMIN', 'SUPER_ADMIN']);
  });

  it('lets reads from anywhere through but checks where changes come from', async () => {
    vi.mocked(requireSession).mockResolvedValue(user);
    const evil = { origin: 'https://evil.example.com' };
    await expect(
      requireAdmin(new Request('http://shop.test/api/x', { headers: evil })),
    ).resolves.toBe(user);
    await expect(
      requireAdmin(new Request('http://shop.test/api/x', { method: 'POST', headers: evil })),
    ).rejects.toMatchObject({ code: 'BAD_ORIGIN', status: 403 });
    await expect(
      requireAdmin(
        new Request('http://shop.test/api/x', {
          method: 'DELETE',
          headers: { origin: 'http://shop.test' },
        }),
      ),
    ).resolves.toBe(user);
  });

  it('refuses a cross-site change before even looking at who is signed in', async () => {
    await expect(
      requireAdmin(
        new Request('http://shop.test/api/x', {
          method: 'PUT',
          headers: { origin: 'https://evil.example.com' },
        }),
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(requireSession).not.toHaveBeenCalled();
  });

  it('passes on the sign-in failure', async () => {
    vi.mocked(requireSession).mockRejectedValue(new AppError('UNAUTHENTICATED', 'Sign in', 401));
    await expect(requireAdmin(new Request('http://shop.test/api/x'))).rejects.toMatchObject({
      status: 401,
    });
  });
});
