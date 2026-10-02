import { useEffect, useState } from "react";
import { PanelLeft } from "lucide-react";
import { ParcelMap } from "../../components/gis/ParcelMap";
import { ParcelSearchPanel } from "../../components/gis/ParcelSearchPanel";
import { ParcelDetailPanel } from "../../components/gis/ParcelDetailPanel";
import { LoadingBlock, ErrorBlock } from "../../components/ui/AsyncState";
import { useApi } from "../../hooks/useApi";
import { useAIChat } from "../../hooks/useAIChat";
import { apiGet } from "../../services/apiClient";
import type { ApiCase, ApiParcel } from "../../types/api";

export function LandMapPage() {
  const [selectedParcelId, setSelectedParcelId] = useState<string | null>(null);
  const [mobilePanel, setMobilePanel] = useState<"search" | "map">("map");
  const { setContext } = useAIChat();

  const parcelsQuery = useApi(() => apiGet<ApiParcel[]>("/parcels"), []);
  const casesQuery = useApi(() => apiGet<ApiCase[]>("/cases"), []);

  // Keep the shared Copilot context in sync with the parcel the user selected.
  const selectedParcelIdForChat = selectedParcelId;
  const selectedParcelUlpForChat = parcelsQuery.data?.find((p) => p.id === selectedParcelIdForChat)?.ulpin;
  useEffect(() => {
    setContext({
      page: "land-map",
      parcelId: selectedParcelIdForChat ?? undefined,
      ulpin: selectedParcelUlpForChat,
    });
  }, [setContext, selectedParcelIdForChat, selectedParcelUlpForChat]);

  function handleSelect(parcelId: string) {
    setSelectedParcelId(parcelId);
    setMobilePanel("map");
  }

  const loading = parcelsQuery.loading || casesQuery.loading;
  const error = parcelsQuery.error ?? casesQuery.error;

  if (loading) {
    return <LoadingBlock label="Loading parcels…" />;
  }

  if (error || !parcelsQuery.data || !casesQuery.data) {
    return (
      <div className="p-6">
        <ErrorBlock
          message={error ?? "Something went wrong."}
          onRetry={() => {
            parcelsQuery.refetch();
            casesQuery.refetch();
          }}
        />
      </div>
    );
  }

  const parcels = parcelsQuery.data;
  const cases = casesQuery.data;
  const selectedParcel = parcels.find((p) => p.id === selectedParcelId) ?? null;

  return (
    <>
      <div className="flex h-[calc(100vh-4rem)] flex-col sm:flex-row">
        {/* Mobile toggle between the search list and the map */}
        <div className="flex border-b border-hairline bg-white sm:hidden">
          <button
            type="button"
            onClick={() => setMobilePanel("search")}
            className={`flex flex-1 items-center justify-center gap-2 py-3 text-sm font-medium ${
              mobilePanel === "search" ? "border-b-2 border-navy-900 text-navy-950" : "text-slate"
            }`}
          >
            <PanelLeft className="h-4 w-4" strokeWidth={1.75} />
            Search
          </button>
          <button
            type="button"
            onClick={() => setMobilePanel("map")}
            className={`flex-1 py-3 text-sm font-medium ${
              mobilePanel === "map" ? "border-b-2 border-navy-900 text-navy-950" : "text-slate"
            }`}
          >
            Map
          </button>
        </div>

        <div className={`${mobilePanel === "search" ? "flex" : "hidden"} min-h-0 flex-1 sm:flex sm:flex-none`}>
          <ParcelSearchPanel
            parcels={parcels}
            cases={cases}
            selectedParcelId={selectedParcelId}
            onSelectParcel={handleSelect}
          />
        </div>

        <div className={`relative min-h-0 min-w-0 flex-1 ${mobilePanel === "map" ? "block" : "hidden"} sm:block`}>
          <ParcelMap parcels={parcels} cases={cases} selectedParcelId={selectedParcelId} onSelectParcel={handleSelect} />
        </div>

        {selectedParcel && (
          <div className="fixed inset-0 z-40 sm:static sm:z-auto">
            <ParcelDetailPanel parcel={selectedParcel} cases={cases} onClose={() => setSelectedParcelId(null)} />
          </div>
        )}
      </div>
    </>
  );
}
