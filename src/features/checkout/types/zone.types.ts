/** A delivery area as offered to the customer (display data; the server prices from the database). */
export interface ZoneOption {
  id: string;
  name: string;
  charge: number;
  freeDeliveryAbove: number | null;
}
