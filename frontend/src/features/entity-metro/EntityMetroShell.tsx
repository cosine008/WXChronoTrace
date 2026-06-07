import { useMemo, useState } from "react";

import { EntityIdChip } from "@/components/badges";

import { EntityMetroStationDetail } from "./EntityMetroStationDetail.tsx";
import { EntityMetroStationList } from "./EntityMetroStationList.tsx";
import { EntityMetroToolbar } from "./EntityMetroToolbar.tsx";
import { buildEntityMetroModel } from "./entityMetroTransforms.ts";
import type { EntityMetroShellProps, EntityMetroStation, EntityMetroViewMode } from "./entityMetroTypes.ts";

export function EntityMetroShell(props: EntityMetroShellProps) {
  const [viewMode, setViewMode] = useState<EntityMetroViewMode>(
    props.context.viewMode ?? "key-stations"
  );

  const metroModel = useMemo(
    () => buildEntityMetroModel(props.timeline, { ...props.context, viewMode }),
    [props.context, props.timeline, viewMode]
  );

  const allStations = useMemo(
    () => [...metroModel.keyStations, ...metroModel.minorStations].sort(sortStations),
    [metroModel]
  );
  const visibleStations = viewMode === "all-versions" ? allStations : metroModel.keyStations;
  const fallbackSelectedStationId =
    metroModel.highlightedStationId ?? visibleStations[0]?.id ?? allStations[0]?.id ?? null;
  const [selectedStationId, setSelectedStationId] = useState<string | null>(
    fallbackSelectedStationId
  );
  const effectiveSelectedStationId = visibleStations.some((station) => station.id === selectedStationId)
    ? selectedStationId
    : fallbackSelectedStationId;

  const selectedStation = visibleStations.find((station) => station.id === effectiveSelectedStationId)
    ?? allStations.find((station) => station.id === effectiveSelectedStationId)
    ?? null;

  return (
    <section
      className={`grid gap-4 ${
        props.variant === "fullscreen"
          ? "min-h-full bg-background px-5 py-5"
          : "bg-background/80 px-3 py-3"
      }`}
    >
      <header className="grid gap-3 border border-border bg-card/80 px-4 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="grid gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-foreground">Entity Metro</h2>
              <EntityIdChip code={props.timeline.entity.display_code} />
            </div>
            <p className="text-xs text-muted-foreground">
              {props.timeline.records.length} 个时间版本，默认聚焦关键站点并保留完整 payload 展开区。
            </p>
          </div>
          <div className="font-mono text-xs text-muted-foreground">
            schema #{props.timeline.entity.schema_id} · entity #{props.timeline.entity.id}
          </div>
        </div>
        <EntityMetroToolbar
          variant={props.variant}
          viewMode={viewMode}
          keyStationCount={metroModel.keyStations.length}
          minorStationCount={metroModel.minorStations.length}
          highlightedStationId={metroModel.highlightedStationId}
          onViewModeChange={setViewMode}
        />
      </header>

      <div
        className={`grid gap-4 ${
          props.variant === "fullscreen"
            ? "xl:grid-cols-[minmax(0,1.55fr)_minmax(20rem,0.95fr)]"
            : "lg:grid-cols-[minmax(0,1.45fr)_minmax(18rem,0.95fr)]"
        }`}
      >
        <section className="grid gap-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>线路视图</span>
            <span className="font-mono">
              {viewMode === "all-versions" ? "ALL_VERSIONS" : "KEY_ONLY"}
            </span>
          </div>
          <EntityMetroStationList
            variant={props.variant}
            stations={visibleStations}
            selectedStationId={effectiveSelectedStationId}
            highlightedStationId={metroModel.highlightedStationId}
            onSelect={setSelectedStationId}
          />
        </section>

        <section className="grid gap-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>站点详情</span>
            <span className="font-mono">
              {selectedStation
                ? `v${selectedStation.schemaVersion} / #${selectedStation.record.record_id}`
                : "NO_SELECTION"}
            </span>
          </div>
          <EntityMetroStationDetail station={selectedStation} />
        </section>
      </div>
    </section>
  );
}

function sortStations(left: EntityMetroStation, right: EntityMetroStation) {
  return left.timelineIndex - right.timelineIndex;
}
