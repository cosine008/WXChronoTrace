import type { ChangeSetSummary } from "@/api/schemas";
import { EmptyState } from "@/components/feedback";
import { ChangeSetSummaryButton } from "./ChangeSetSummaryButton";
import { ChangeStreamFilterBar, FilterToggleBar } from "./ChangeStreamFilterControls";
import { ChangeStreamFilterSummary } from "./ChangeStreamFilterSummary";
import { ChangeStreamPager } from "./ChangeStreamPager";
import type { ChangeStreamFilters } from "./ChangeStreamPanel";

export function ChangeSetBatchListPanel(props: {
  changesets: ChangeSetSummary[];
  filters: ChangeStreamFilters;
  filtersActive: boolean;
  filtersOpen: boolean;
  selectedId?: number;
  compareLeftId?: number;
  compareRightId?: number;
  page: number;
  totalPages: number;
  totalCount: number;
  currentUserId?: number;
  onToggleFilters: () => void;
  onClearFilters: () => void;
  onFiltersChange: (patch: Partial<ChangeStreamFilters>) => void;
  onSelect: (id: number) => void;
  onCompareLeft: (id: number) => void;
  onCompareRight: (id: number) => void;
  onPage: (page: number) => void;
}) {
  return (
    <div
      id="change-inspector-panel-batches"
      role="tabpanel"
      aria-labelledby="change-inspector-tab-batches"
      className="flex min-h-0 flex-1 flex-col"
    >
      <FilterToggleBar
        active={props.filtersActive}
        open={props.filtersOpen}
        onToggle={props.onToggleFilters}
        onClear={props.onClearFilters}
      />
      {props.filtersOpen && (
        <ChangeStreamFilterBar
          filters={props.filters}
          currentUserId={props.currentUserId}
          onChange={props.onFiltersChange}
        />
      )}
      <ChangeStreamFilterSummary filters={props.filters} onClear={props.onFiltersChange} />
      <div className="min-h-0 flex-1 overflow-auto">
        {props.changesets.length === 0 ? (
          <EmptyState
            title={props.filtersActive ? "筛选无结果" : "暂无变更批次"}
            description={
              props.filtersActive ? "调整状态、创建者或日期范围后再查看。" : "当前表还没有变更历史。"
            }
            minH="min-h-full"
          />
        ) : (
          props.changesets.map((item) => (
            <ChangeSetSummaryButton
              key={item.id}
              item={item}
              selected={item.id === props.selectedId}
              compareLeft={item.id === props.compareLeftId}
              compareRight={item.id === props.compareRightId}
              onClick={() => props.onSelect(item.id)}
              onCompareLeft={() => props.onCompareLeft(item.id)}
              onCompareRight={() => props.onCompareRight(item.id)}
            />
          ))
        )}
      </div>
      <ChangeStreamPager
        page={props.page}
        totalPages={props.totalPages}
        totalCount={props.totalCount}
        onPage={props.onPage}
      />
    </div>
  );
}
