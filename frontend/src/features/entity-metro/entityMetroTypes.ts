import type { EntityTimelineResponse, TimelineRecord } from "../../api/schemas.ts";

export type EntityMetroViewMode = "key-stations" | "all-versions";
export type EntityMetroVariant = "drawer" | "fullscreen";
export type EntityMetroSource = "current-view" | "diff-studio";
export type EntityMetroStationLevel = "key" | "minor";
export type EntityMetroStationReasonCode =
  | "create"
  | "terminate"
  | "status-change"
  | "department-change"
  | "key-field-change";
export type EntityMetroFieldChangeKind = "status" | "department" | "key" | "other";

export interface EntityMetroContext {
  source: EntityMetroSource;
  viewMode?: EntityMetroViewMode;
  statusFieldKeys?: string[];
  departmentFieldKeys?: string[];
  keyFieldKeys?: string[];
  highlightedFieldKeys?: string[];
  highlightedRecordId?: number | string | null;
  highlightedRecordIds?: Array<number | string>;
  highlightedVersionRange?: {
    startSchemaVersion?: number | null;
    endSchemaVersion?: number | null;
  } | null;
}

export interface EntityMetroFieldChange {
  key: string;
  label: string;
  before: unknown;
  after: unknown;
  kind: EntityMetroFieldChangeKind;
  highlighted: boolean;
}

export interface EntityMetroStation {
  id: string;
  level: EntityMetroStationLevel;
  title: string;
  summary: string;
  timelineIndex: number;
  schemaVersion: number;
  reasonCodes: EntityMetroStationReasonCode[];
  changedFields: string[];
  fieldChanges: EntityMetroFieldChange[];
  highlighted: boolean;
  record: TimelineRecord;
}

export interface EntityMetroModel {
  keyStations: EntityMetroStation[];
  minorStations: EntityMetroStation[];
  highlightedStationId: string | null;
}

export interface EntityMetroShellProps {
  timeline: EntityTimelineResponse;
  context: EntityMetroContext;
  variant: EntityMetroVariant;
}

export interface EntityMetroToolbarProps {
  variant: EntityMetroVariant;
  viewMode: EntityMetroViewMode;
  keyStationCount: number;
  minorStationCount: number;
  highlightedStationId: string | null;
  onViewModeChange: (mode: EntityMetroViewMode) => void;
}

export interface EntityMetroStationListProps {
  variant: EntityMetroVariant;
  stations: EntityMetroStation[];
  selectedStationId: string | null;
  highlightedStationId: string | null;
  onSelect: (stationId: string) => void;
}

export interface EntityMetroStationDetailProps {
  station: EntityMetroStation | null;
}
