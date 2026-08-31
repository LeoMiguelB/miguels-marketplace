import type { CatalogTrack } from "@/lib/catalog";

export function CatalogGrid({
  tracks,
  selectedId,
  onPick,
}: {
  tracks: CatalogTrack[];
  selectedId: number | null;
  onPick: (id: number) => void;
}) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5 p-4">
      {tracks.map((track) => {
        const on = track.id === selectedId;
        return (
          <button
            key={track.id}
            type="button"
            onClick={() => onPick(track.id)}
            className={`text-left border ${on ? "border-on" : "border-line"} bg-bg`}
          >
            <div className="relative aspect-square bg-bg border-b border-line">
              {track.cover_blob_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={track.cover_blob_url}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : null}
              {on ? (
                <span className="absolute bottom-1.5 left-1.5 border border-on bg-bg px-1 text-[10px] text-fg">
                  ON
                </span>
              ) : null}
            </div>
            <div className={`px-2 py-1.5 text-xs ${on ? "text-fg font-bold" : "text-on"}`}>
              {track.title}
            </div>
          </button>
        );
      })}
    </div>
  );
}
