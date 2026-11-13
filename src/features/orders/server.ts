import { prisma } from '@/lib/prisma/client';
import { createNoopEmailer, createResendEmailer, type Emailer } from './services/order-email';
import { createOrderRepository, type OrderRepository } from './services/order.repository';
import { createOrderService, type OrderService } from './services/order.service';
import { createOrderPhoneRepository, type OrderPhoneDeps } from './services/order-phone';
import { verification } from '@/features/verification/server';
import { createPrismaOrderStore } from './services/order.store';

let service: OrderService | undefined;
let repository: OrderRepository | undefined;

/** Lazily wires the order flow to Prisma (server-only). */
export function getOrderService(): OrderService {
  service ??= createOrderService(createPrismaOrderStore(prisma));
  return service;
}

/** What checkout needs to check the contact number and find the account it belongs to. */
export function getOrderPhoneDeps(): OrderPhoneDeps {
  return {
    ...createOrderPhoneRepository(prisma),
    provenAt: (id, phone) => verification.provenAt(id, phone),
  };
}

export function getOrderRepository(): OrderRepository {
  repository ??= createOrderRepository(prisma);
  return repository;
}

/** Real emails when a Resend key is configured, otherwise a no-op so local development just works. */
export function getEmailer(): Emailer {
  const apiKey = process.env['RESEND_API_KEY'];
  if (!apiKey) return createNoopEmailer();
  return createResendEmailer({
    apiKey,
    from: process.env['RESEND_FROM_EMAIL'] || 'orders@bbqstore.pk',
  });
}
