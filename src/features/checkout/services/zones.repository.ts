import type { PrismaClient } from '@prisma/client';
import type { ZoneOption } from '../types/zone.types';
import { mapZoneData } from './quote-data.mappers';

export function createZonesRepository(prisma: PrismaClient) {
  return {
    async listActive(): Promise<ZoneOption[]> {
      const rows = await prisma.deliveryZone.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
      });
      return rows.map(mapZoneData).map(({ id, name, charge, freeDeliveryAbove }) => ({
        id,
        name,
        charge,
        freeDeliveryAbove,
      }));
    },
  };
}
