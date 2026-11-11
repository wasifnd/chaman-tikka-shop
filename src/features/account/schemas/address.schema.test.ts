import { describe, expect, it } from 'vitest';
import { pageCount, summarizeItems } from '../logic/order-summary';
import { addressInputSchema } from './address.schema';

const ZONE = '11111111-1111-4111-8111-111111111111';
const valid = {
  label: 'Home',
  addressLine1: 'House 12, Street 4',
  addressLine2: '',
  zoneId: ZONE,
  isDefault: false,
};

describe('addressInputSchema', () => {
  it('accepts a normal address and turns a blank second line into none', () => {
    expect(addressInputSchema.parse(valid)).toEqual({ ...valid, addressLine2: null });
  });

  it('trims what was typed', () => {
    const parsed = addressInputSchema.parse({
      ...valid,
      label: '  Office ',
      addressLine1: '  Plot 5  ',
    });
    expect(parsed).toMatchObject({ label: 'Office', addressLine1: 'Plot 5' });
  });

  it.each([
    [{ label: '   ' }, 'label'],
    [{ label: 'x'.repeat(31) }, 'label'],
    [{ addressLine1: 'ab' }, 'addressLine1'],
    [{ addressLine1: 'x'.repeat(201) }, 'addressLine1'],
    [{ addressLine2: 'x'.repeat(201) }, 'addressLine2'],
    [{ zoneId: '' }, 'zoneId'],
    [{ zoneId: 'not-a-uuid' }, 'zoneId'],
    [{ isDefault: 'yes' }, 'isDefault'],
  ])('rejects %j', (change, field) => {
    const result = addressInputSchema.safeParse({ ...valid, ...change });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.path[0])).toContain(field);
  });

  it('ignores fields a customer should not set, such as who the address belongs to', () => {
    const parsed = addressInputSchema.parse({ ...valid, customerId: 'someone-else', id: 'x' });
    expect(parsed).not.toHaveProperty('customerId');
    expect(parsed).not.toHaveProperty('id');
  });
});

describe('summarizeItems', () => {
  const item = (name: string, quantity = 1) => ({ name, quantity });

  it('shows up to two items with quantities and counts the rest', () => {
    expect(
      summarizeItems([item('Tikka', 2), item('Naan', 4), item('Raita'), item('Cola')]),
    ).toEqual({
      shown: ['2 × Tikka', '4 × Naan'],
      more: 2,
    });
  });

  it('has nothing extra for short orders', () => {
    expect(summarizeItems([item('Tikka')])).toEqual({ shown: ['1 × Tikka'], more: 0 });
    expect(summarizeItems([])).toEqual({ shown: [], more: 0 });
  });
});

describe('pageCount', () => {
  it.each([
    [0, 1],
    [1, 1],
    [10, 1],
    [11, 2],
    [95, 10],
    [100, 10],
    [101, 11],
  ])('%i orders take %i page(s)', (total, pages) => {
    expect(pageCount(total)).toBe(pages);
  });
});
