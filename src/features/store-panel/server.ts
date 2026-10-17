import { prisma } from '@/lib/prisma/client';
import {
  createStaffOrdersRepository,
  type StaffOrdersRepository,
} from './services/staff-orders.repository';
import { createTransitionService, type TransitionService } from './services/transition.service';
import { createPrismaTransitionStore } from './services/transition.store';

let transitions: TransitionService | undefined;
let repository: StaffOrdersRepository | undefined;

/** Lazily wires the store panel to Prisma (server-only). */
export function getTransitionService(): TransitionService {
  transitions ??= createTransitionService(createPrismaTransitionStore(prisma));
  return transitions;
}

export function getStaffOrdersRepository(): StaffOrdersRepository {
  repository ??= createStaffOrdersRepository(prisma);
  return repository;
}
