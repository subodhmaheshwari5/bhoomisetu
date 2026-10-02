import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Search } from "lucide-react";
import { PARCEL_STATUS_COLORS, caseForParcel, parcelMapStatus, searchParcels } from "../../data/gisData";
import { apiGet, ApiRequestError } from "../../services/apiClient";
import type { ApiCase, ApiParcel } from "../../types/api";
import { EmptyBlock } from "../ui/AsyncState";

interface ParcelSearchPanelProps {
  parcels: ApiParcel[];
  cases: ApiCase[];
  selectedParcelId: string | null;
  onSelectParcel: (parcelId: string) => void;
}

function ParcelRow({
  parcel,
  cases,
  selected,
  onSelect,
}: {
  parcel: ApiParcel;
  cases: ApiCase[];
  selected: boolean;
  onSelect: () => void;
}) {
  const status = parcelMapStatus(parcel.id, cases);
  const linkedCase = caseForParcel(parcel.id, cases);
  const { fill, label } = PARCEL_STATUS_COLORS[status];

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full flex-col gap-1 border-b border-hairline px-4 py-3 text-left transition-colors ${
        selected ? "bg-navy-50" : "hover:bg-paper-dim"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-sm text-navy-950">{parcel.ulpin}</span>
        <span className="flex items-center gap-1.5 text-xs text-ink-soft">
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: fill }} aria-hidden="true" />
          {label}
        </span>
      </div>
      <p className="text-xs text-ink-soft">
        {parcel.districtName}
        {linkedCase ? ` · ${linkedCase.caseNumber}` : " · No case linked"}
      </p>
    </button>
  );
}

export function ParcelSearchPanel({ parcels, cases, selectedParcelId, onSelectParcel }: ParcelSearchPanelProps) {
  const [query, setQuery] = useState("");
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [looking, setLooking] = useState(false);

  const results = useMemo(() => searchParcels(query, parcels, cases), [query, parcels, cases]);

  // Enter/submit does a real backend lookup by exact ULPIN, so malformed and
  // unknown ULPINs surface the backend's own validation/not-found responses
  // rather than only ever filtering the already-loaded list.
  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;

    setLooking(true);
    setLookupError(null);
    try {
      const parcel = await apiGet<ApiParcel>(`/parcels/${encodeURIComponent(trimmed.toUpperCase())}`);
      onSelectParcel(parcel.id);
    } catch (err) {
      setLookupError(err instanceof ApiRequestError ? err.message : "Could not look up that ULPIN.");
    } finally {
      setLooking(false);
    }
  }

  return (
    <div className="flex h-full w-full flex-col border-r border-hairline bg-white sm:w-80">
      <div className="border-b border-hairline px-4 py-4">
        <h2 className="font-display text-lg text-navy-950">Land Map</h2>
        <p className="mt-0.5 text-xs text-ink-soft">Search by ULPIN, Case ID, project or district</p>
        <form onSubmit={handleSubmit} className="relative mt-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate" />
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setLookupError(null);
            }}
            placeholder="RJ-08-… · BS-2026-… · Jaipur"
            className="w-full border border-hairline bg-paper py-2 pl-9 pr-3 text-sm text-ink placeholder:text-slate focus:border-navy-500 focus:outline-none"
          />
        </form>
        <p className="mt-1.5 text-[11px] text-slate">Press Enter to look up an exact ULPIN against the API.</p>
        {looking && <p className="mt-1.5 text-[11px] text-slate">Looking up…</p>}
        {lookupError && <p className="mt-1.5 text-xs text-danger">{lookupError}</p>}
      </div>

      <div className="flex-1 overflow-y-auto">
        {results.length === 0 ? (
          <div className="px-4 py-6">
            <EmptyBlock message={`No parcels match "${query}".`} />
          </div>
        ) : (
          results.map(({ parcel }) => (
            <ParcelRow
              key={parcel.id}
              parcel={parcel}
              cases={cases}
              selected={parcel.id === selectedParcelId}
              onSelect={() => onSelectParcel(parcel.id)}
            />
          ))
        )}
      </div>

      <div className="border-t border-hairline px-4 py-3">
        <p className="mb-2 font-mono text-[11px] text-slate">Status</p>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {Object.values(PARCEL_STATUS_COLORS).map(({ fill, label }) => (
            <span key={label} className="flex items-center gap-1.5 text-xs text-ink-soft">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: fill }} aria-hidden="true" />
              {label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
