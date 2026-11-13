'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import type { UseFormGetValues, UseFormSetValue } from 'react-hook-form';
import { useSession } from '@/features/auth/hooks/useSession';
import type { CustomerProfile, SavedAddress } from '@/features/account/types/account.types';
import { useCartStore } from '@/features/cart/store/useCartStore';
import { fetchWithRefresh } from '@/shared/utils/authed-fetch';
import type { CheckoutFormValues } from '../schemas/checkout-form.schema';

interface Prefill {
  profile: CustomerProfile;
  addresses: SavedAddress[];
}

async function fetchPrefill(): Promise<Prefill | null> {
  const response = await fetchWithRefresh('/api/v1/account/profile');
  // Anything but a customer with a profile (staff, signed out, a hiccup) just means no shortcuts.
  if (!response.ok) return null;
  const body = (await response.json()) as { data?: Prefill };
  return body.data ?? null;
}

/**
 * For a signed-in customer, fills in their name, phone and email and offers their saved
 * addresses, so checkout is a couple of taps. Guests are unaffected. Never overwrites anything
 * the customer has already typed.
 */
export function useCheckoutPrefill(
  setValue: UseFormSetValue<CheckoutFormValues>,
  getValues: UseFormGetValues<CheckoutFormValues>,
  orderType: string,
) {
  const { data: user } = useSession();
  const { data } = useQuery({
    queryKey: ['account-profile'],
    queryFn: fetchPrefill,
    enabled: Boolean(user?.customerId),
    staleTime: 60_000,
    retry: false,
  });
  const detailsFilled = useRef(false);
  const defaultApplied = useRef(false);

  const addresses = data?.addresses ?? [];

  /** Puts a saved address into the form and picks its delivery area. */
  function applyAddress(address: SavedAddress) {
    setValue('addressLine1', address.addressLine1, { shouldDirty: true });
    setValue('addressLine2', address.addressLine2 ?? '', { shouldDirty: true });
    useCartStore.getState().setZone(address.zoneId);
  }

  useEffect(() => {
    if (!data || detailsFilled.current) return;
    detailsFilled.current = true;
    const { profile } = data;
    if (!getValues('name')) setValue('name', profile.name);
    if (!getValues('phone') && profile.phone) setValue('phone', profile.phone);
    if (!getValues('email') && profile.email) setValue('email', profile.email);
  }, [data, getValues, setValue]);

  useEffect(() => {
    if (!data || defaultApplied.current || orderType !== 'DELIVERY') return;
    const preferred = data.addresses.find((address) => address.isDefault && address.zoneActive);
    if (!preferred || getValues('addressLine1')) return;
    defaultApplied.current = true;
    setValue('addressLine1', preferred.addressLine1);
    setValue('addressLine2', preferred.addressLine2 ?? '');
    useCartStore.getState().setZone(preferred.zoneId);
  }, [data, orderType, getValues, setValue]);

  // The account's own number, when it's proven: checkout needn't ask to verify it again.
  const verifiedPhone = data?.profile.phoneVerified ? data.profile.phone : null;

  return { addresses, applyAddress, verifiedPhone };
}
