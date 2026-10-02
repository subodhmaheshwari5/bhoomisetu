import { useEffect } from "react";
import { MapContainer, TileLayer, Polygon, Tooltip as LeafletTooltip, useMap } from "react-leaflet";
import { PARCEL_STATUS_COLORS, parcelMapStatus } from "../../data/gisData";
import { toLeafletBoundary, toLeafletCentroid } from "../../utils/geo";
import type { ApiCase, ApiParcel } from "../../types/api";

const RAJASTHAN_CENTER: [number, number] = [26.5, 74.8];
const DEFAULT_ZOOM = 7;
const FOCUS_ZOOM = 13;

function MapFocus({ parcel }: { parcel: ApiParcel | null }) {
  const map = useMap();

  useEffect(() => {
    if (parcel) {
      const { lat, lng } = toLeafletCentroid(parcel.centroid);
      map.flyTo([lat, lng], FOCUS_ZOOM, { duration: 0.6 });
    } else {
      map.flyTo(RAJASTHAN_CENTER, DEFAULT_ZOOM, { duration: 0.6 });
    }
  }, [parcel, map]);

  return null;
}

interface ParcelMapProps {
  parcels: ApiParcel[];
  cases: ApiCase[];
  selectedParcelId: string | null;
  onSelectParcel: (parcelId: string) => void;
}

export function ParcelMap({ parcels, cases, selectedParcelId, onSelectParcel }: ParcelMapProps) {
  const selectedParcel = parcels.find((p) => p.id === selectedParcelId) ?? null;

  return (
    <MapContainer
      center={RAJASTHAN_CENTER}
      zoom={DEFAULT_ZOOM}
      scrollWheelZoom
      className="h-full w-full"
      attributionControl
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />

      <MapFocus parcel={selectedParcel} />

      {parcels.map((parcel) => {
        const status = parcelMapStatus(parcel.id, cases);
        const color = PARCEL_STATUS_COLORS[status].fill;
        const isSelected = parcel.id === selectedParcelId;

        return (
          <Polygon
            key={parcel.id}
            positions={toLeafletBoundary(parcel.boundary)}
            pathOptions={{
              color: isSelected ? "var(--color-gold-500)" : color,
              weight: isSelected ? 3 : 1.5,
              fillColor: color,
              fillOpacity: isSelected ? 0.55 : 0.35,
            }}
            eventHandlers={{
              click: () => onSelectParcel(parcel.id),
            }}
          >
            <LeafletTooltip direction="top" sticky>
              <span className="font-mono text-xs">{parcel.ulpin}</span>
            </LeafletTooltip>
          </Polygon>
        );
      })}
    </MapContainer>
  );
}
