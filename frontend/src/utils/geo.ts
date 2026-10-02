import type { ApiParcel } from "../types/api";

/** GeoJSON orders coordinates [lng, lat]; Leaflet wants [lat, lng]. */
export function toLeafletCentroid(centroid: ApiParcel["centroid"]): { lat: number; lng: number } {
  const [lng, lat] = centroid.coordinates;
  return { lat, lng };
}

export function toLeafletBoundary(boundary: ApiParcel["boundary"]): [number, number][] {
  const ring = boundary.coordinates[0] ?? [];
  return ring.map(([lng, lat]) => [lat, lng]);
}
