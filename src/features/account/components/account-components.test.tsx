// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ZoneOption } from '@/features/checkout/types/zone.types';
import messages from '@/i18n/messages/en.json';
import { click, nextCall, typeInto, useApiMock } from '@/features/admin/testing/harness';
import type { SavedAddress } from '../types/account.types';
import { AccountNav } from './AccountNav';
import { AddressesManager } from './AddressesManager';

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
const nav = vi.hoisted(() => ({ pathname: '/account/orders' }));
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => nav.pathname }));

beforeEach(() => {
  router.push.mockReset();
  router.refresh.mockReset();
});
afterEach(cleanup);

const show = (ui: React.ReactElement) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>,
  );

const ZONE = '11111111-1111-4111-8111-111111111111';
const ZONE2 = '11111111-1111-4111-8111-222222222222';
const zones: ZoneOption[] = [
  { id: ZONE, name: 'Johar Town', charge: 100, freeDeliveryAbove: null },
  { id: ZONE2, name: 'Model Town', charge: 150, freeDeliveryAbove: null },
];
const address = (overrides: Partial<SavedAddress> = {}): SavedAddress => ({
  id: 'a1',
  label: 'Home',
  addressLine1: 'House 12, Street 4',
  addressLine2: 'Near the park',
  zoneId: ZONE,
  zoneName: 'Johar Town',
  zoneActive: true,
  isDefault: true,
  ...overrides,
});

describe('AccountNav', () => {
  it('links to orders and addresses and marks where you are', () => {
    nav.pathname = '/account/addresses';
    show(<AccountNav />);
    expect(screen.getByRole('link', { name: 'My orders' })).toHaveAttribute(
      'href',
      '/account/orders',
    );
    expect(screen.getByRole('link', { name: 'My addresses' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'My orders' })).not.toHaveAttribute('aria-current');
  });
});

describe('AddressesManager', () => {
  const api = useApiMock();

  it('lists addresses in full, marks the default and warns about a closed area', () => {
    show(
      <AddressesManager
        addresses={[
          address(),
          address({
            id: 'a2',
            label: 'Old flat',
            addressLine1: 'Flat 3',
            addressLine2: null,
            isDefault: false,
            zoneActive: false,
          }),
        ]}
        zones={zones}
      />,
    );
    expect(screen.getByText('House 12, Street 4, Near the park, Johar Town')).toBeInTheDocument();
    expect(screen.getByText('Default')).toBeInTheDocument();
    expect(screen.getByText(/no longer deliver to this area/)).toBeInTheDocument();
  });

  it('says so when there are none', () => {
    show(<AddressesManager addresses={[]} zones={zones} />);
    expect(screen.getByText('No saved addresses yet.')).toBeInTheDocument();
  });

  it('cannot add an address when no area is served', () => {
    show(<AddressesManager addresses={[]} zones={[]} />);
    expect(screen.getByRole('button', { name: 'Add address' })).toBeDisabled();
    expect(screen.getByText(/not delivering to any area/)).toBeInTheDocument();
  });

  it('stops at ten saved addresses', () => {
    const ten = Array.from({ length: 10 }, (_, i) =>
      address({ id: `a${String(i)}`, label: `Place ${String(i)}`, isDefault: i === 0 }),
    );
    show(<AddressesManager addresses={ten} zones={zones} />);
    expect(screen.getByRole('button', { name: 'Add address' })).toBeDisabled();
    expect(screen.getByText(/up to 10 addresses/)).toBeInTheDocument();
  });

  it('checks the form before sending anything', async () => {
    show(<AddressesManager addresses={[]} zones={zones} />);
    click('Add address');
    click('Save');
    expect(await screen.findByText('Give it a name, like Home')).toBeInTheDocument();
    expect(screen.getByText('Enter your street address')).toBeInTheDocument();
    // (the same words are also the placeholder option, so look for the error message itself)
    expect(
      screen.getAllByText('Choose your area').some((el) => el.getAttribute('role') === 'alert'),
    ).toBe(true);
    expect(api.calls).toHaveLength(0);
  });

  it('saves a new address', async () => {
    api.succeed('POST', '/api/v1/account/addresses', { id: 'new' }, 201);
    show(<AddressesManager addresses={[]} zones={zones} />);
    click('Add address');
    typeInto('Name for this address', 'Office');
    typeInto('Street address', 'Plot 5, Main Blvd');
    fireEvent.change(screen.getByLabelText('Area'), { target: { value: ZONE2 } });
    fireEvent.click(screen.getByLabelText('Use this as my default address'));
    click('Save');
    const call = await nextCall(api, 'POST');
    expect(call?.body).toEqual({
      label: 'Office',
      addressLine1: 'Plot 5, Main Blvd',
      addressLine2: null,
      zoneId: ZONE2,
      isDefault: true,
    });
    await waitFor(() => {
      expect(router.refresh).toHaveBeenCalled();
    });
  });

  it('shows what the server refused', async () => {
    api.fail(
      'POST',
      '/api/v1/account/addresses',
      'ZONE_INVALID',
      'We do not deliver to that area.',
      422,
      {
        zoneId: 'We do not deliver to that area',
      },
    );
    show(<AddressesManager addresses={[]} zones={zones} />);
    click('Add address');
    typeInto('Name for this address', 'Home');
    typeInto('Street address', 'House 12');
    fireEvent.change(screen.getByLabelText('Area'), { target: { value: ZONE } });
    click('Save');
    expect(await screen.findByText('We do not deliver to that area')).toBeInTheDocument();
  });

  it('edits an address with its details filled in', async () => {
    show(<AddressesManager addresses={[address()]} zones={zones} />);
    click('Edit Home');
    expect(screen.getByLabelText('Street address')).toHaveValue('House 12, Street 4');
    expect(screen.getByLabelText('Apartment or landmark (optional)')).toHaveValue('Near the park');
    expect(screen.getByLabelText('Use this as my default address')).toBeChecked();
    typeInto('Street address', 'House 14, Street 4');
    click('Save');
    const call = await nextCall(api, 'PATCH');
    expect(call?.url).toBe('/api/v1/account/addresses/a1');
    expect(call?.body).toMatchObject({ addressLine1: 'House 14, Street 4', zoneId: ZONE });
  });

  it('makes the customer pick a new area when the old one is closed', () => {
    show(<AddressesManager addresses={[address({ zoneActive: false })]} zones={zones} />);
    click('Edit Home');
    expect(screen.getByLabelText('Area')).toHaveValue('');
  });

  it('deletes after a second tap and shows a failure', async () => {
    show(<AddressesManager addresses={[address()]} zones={zones} />);
    click('Delete Home');
    expect(api.calls).toHaveLength(0);
    click('Confirm: Delete Home');
    expect((await nextCall(api, 'DELETE'))?.url).toBe('/api/v1/account/addresses/a1');

    api.fail(
      'DELETE',
      '/api/v1/account/addresses/a1',
      'ADDRESS_NOT_FOUND',
      'That address does not exist.',
      404,
    );
    click('Delete Home');
    click('Confirm: Delete Home');
    expect(await screen.findByRole('alert')).toHaveTextContent('That address does not exist.');
  });

  it('can back out of delete and of editing', () => {
    show(<AddressesManager addresses={[address()]} zones={zones} />);
    click('Delete Home');
    click('Cancel');
    expect(screen.getByRole('button', { name: 'Delete Home' })).toBeInTheDocument();
    click('Edit Home');
    click('Cancel');
    expect(api.calls).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Edit Home' })).toBeInTheDocument();
  });
});
