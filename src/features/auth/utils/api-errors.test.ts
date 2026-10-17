import { describe, expect, it } from 'vitest';
import { splitApiError } from './api-errors';

describe('splitApiError', () => {
  it('maps known field details to field errors and hides the general message', () => {
    expect(
      splitApiError(
        { code: 'VALIDATION_ERROR', message: 'bad', details: { email: 'Invalid', other: 'x' } },
        ['email', 'password'],
      ),
    ).toEqual({ fieldErrors: [{ name: 'email', message: 'Invalid' }], formError: null });
  });

  it('falls back to the general message when nothing maps to a field', () => {
    expect(splitApiError({ code: 'INVALID_CREDENTIALS', message: 'Wrong' }, ['email'])).toEqual({
      fieldErrors: [],
      formError: 'Wrong',
    });
    expect(
      splitApiError({ code: 'X', message: 'Nope', details: { unknown: 'u' } }, ['email']),
    ).toEqual({ fieldErrors: [], formError: 'Nope' });
  });
});
