/**
 * Location helpers.
 *
 * Privacy rule: exact coordinates are never published. The public location is
 * snapped to a ~500 m grid cell and nudged randomly inside it, so a pin shows
 * the neighbourhood, not the house.
 */

/** Size of the privacy grid in degrees (~550 m north–south in Melbourne). */
export const PRIVACY_GRID_DEG = 0.005;

/** Rough bounding box for Victoria (used to reject obviously wrong coordinates). */
export const VICTORIA_BOUNDS = { minLat: -39.3, maxLat: -33.9, minLng: 140.9, maxLng: 150.1 };

export function isInVictoria(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= VICTORIA_BOUNDS.minLat &&
    lat <= VICTORIA_BOUNDS.maxLat &&
    lng >= VICTORIA_BOUNDS.minLng &&
    lng <= VICTORIA_BOUNDS.maxLng
  );
}

/**
 * Returns a public, approximate location for an exact point.
 * The result is always within one grid cell (~500 m) of the original point
 * and never equal to it. `random` is injectable for testing.
 */
export function approximateLocation(
  lat: number,
  lng: number,
  random: () => number = Math.random,
): { lat: number; lng: number } {
  const snap = (v: number) => Math.round(v / PRIVACY_GRID_DEG) * PRIVACY_GRID_DEG;
  const jitter = () => (random() - 0.5) * PRIVACY_GRID_DEG * 0.8; // ±40% of a cell
  return {
    lat: round6(snap(lat) + jitter()),
    lng: round6(snap(lng) + jitter()),
  };
}

/** Great-circle distance in kilometres (haversine formula). */
export function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** A lat/lng box that contains a circle of `radiusKm` around a point. */
export function boundingBox(lat: number, lng: number, radiusKm: number) {
  const dLat = radiusKm / 111.32;
  const dLng = radiusKm / (111.32 * Math.cos((lat * Math.PI) / 180));
  return { minLat: lat - dLat, maxLat: lat + dLat, minLng: lng - dLng, maxLng: lng + dLng };
}

export function formatDistance(km: number): string {
  if (km < 1) return "under 1 km";
  if (km < 10) return `about ${km.toFixed(1)} km`;
  return `about ${Math.round(km)} km`;
}

function round6(v: number): number {
  return Math.round(v * 1e6) / 1e6;
}
