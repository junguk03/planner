'use client';

import { useState } from 'react';
import { Event } from '@/lib/supabase';
import { hhmm } from '@/lib/time';
import { useBackdropClose } from '@/lib/useBackdropClose';

const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];

type CopyMode = 'weekly' | 'daily' | null;

type Props = {
  events: Event[];
  weekMode?: boolean;
  /** e.g. "11월" — shown in the title in month mode */
  monthLabel?: string;
  onClose: () => void;
  /** Resolves to true when the copy was done (the window then closes) */
  onBatchCopy: (events: Event[], mode: 'weekly' | 'daily', options: { startDate?: string; endDate?: string; targetDate?: string }) => Promise<boolean>;
  onBatchDelete: (events: Event[]) => void;
  onEditEvent: (event: Event) => void;
};

export default function SelectMode({ events, weekMode = false, monthLabel, onClose, onBatchCopy, onBatchDelete, onEditEvent }: Props) {
  const backdrop = useBackdropClose(onClose);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [copyMode, setCopyMode] = useState<CopyMode>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [copying, setCopying] = useState(false);

  // ── Month mode: date filter ───────────────────────────────────────────────
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const isFiltered = !weekMode && filterFrom !== '';

  // Events to display after filter (for month mode with filter active)
  const filteredEvents = (() => {
    if (!isFiltered) return events;
    return events.filter((ev) => {
      if (ev.date < filterFrom) return false;
      if (filterTo && ev.date > filterTo) return false;
      return true;
    });
  })();

  // Filtered date groups (when filter is active, show individual events by date)
  const filteredGroups = (() => {
    if (!isFiltered) return null;
    const map = new Map<string, Event[]>();
    filteredEvents.forEach((ev) => {
      if (!map.has(ev.date)) map.set(ev.date, []);
      map.get(ev.date)!.push(ev);
    });
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  })();

  // ── Week mode: group by actual date, no dedup ──────────────────────────────
  const weekGroups = (() => {
    if (!weekMode) return null;
    const map = new Map<string, Event[]>();
    events.forEach((ev) => {
      if (!map.has(ev.date)) map.set(ev.date, []);
      map.get(ev.date)!.push(ev);
    });
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  })();

  // ── Month mode: one row per weekday + title + time ────────────────────────
  // Each row stands for every matching event in the month (patternGroups);
  // uniqueEvents holds the earliest one as the row's representative.
  const patternGroups = (() => {
    const map = new Map<string, Event[]>();
    if (weekMode || isFiltered) return map;
    [...events]
      .sort((a, b) => a.date.localeCompare(b.date))
      .forEach((ev) => {
        const dow = new Date(ev.date + 'T00:00:00').getDay();
        const key = `${dow}-${ev.title}-${hhmm(ev.start_time)}-${hhmm(ev.end_time)}`;
        const group = map.get(key);
        if (group) group.push(ev);
        else map.set(key, [ev]);
      });
    return map;
  })();

  const uniqueEvents = new Map<string, Event>(
    Array.from(patternGroups.entries()).map(([key, group]) => [key, group[0]]),
  );

  const groupedUnique = (() => {
    if (weekMode || isFiltered) return new Map<number, { key: string; event: Event }[]>();
    const map = new Map<number, { key: string; event: Event }[]>();
    uniqueEvents.forEach((ev, key) => {
      const dow = parseInt(key.split('-')[0]);
      if (!map.has(dow)) map.set(dow, []);
      map.get(dow)!.push({ key, event: ev });
    });
    return map;
  })();

  const totalCount = weekMode
    ? events.length
    : isFiltered
    ? filteredEvents.length
    : uniqueEvents.size;

  // Keys that can be selected right now. Selected keys that no longer exist
  // (the event was edited or removed meanwhile) are ignored.
  const selectableKeys = weekMode
    ? events.map((e) => e.id)
    : isFiltered
    ? filteredEvents.map((e) => e.id)
    : Array.from(uniqueEvents.keys());
  const activeKeys = selectableKeys.filter((k) => selectedIds.has(k));
  const allSelected = totalCount > 0 && activeKeys.length === totalCount;

  // ── Selection helpers ─────────────────────────────────────────────────────
  const toggleEvent = (key: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleAll = () => {
    setSelectedIds(allSelected ? new Set() : new Set(selectableKeys));
  };

  const patternMode = !weekMode && !isFiltered;

  // One event per selected row (used for copying)
  const selectedEvents = patternMode
    ? activeKeys.map((k) => uniqueEvents.get(k)!)
    : (weekMode ? events : filteredEvents).filter((e) => selectedIds.has(e.id));

  // Every event the selected rows stand for (used for deleting)
  const eventsToDelete = patternMode
    ? activeKeys.flatMap((k) => patternGroups.get(k) ?? [])
    : selectedEvents;

  const handleDelete = () => {
    if (eventsToDelete.length === 0) return;
    if (patternMode && !confirm(`${monthLabel ?? '이번 달'}의 일정 ${eventsToDelete.length}개를 삭제할까요?`)) return;
    onBatchDelete(eventsToDelete);
  };

  const handleCopy = async () => {
    if (selectedEvents.length === 0 || copying) return;
    setCopying(true);
    try {
      if (copyMode === 'weekly' && startDate && endDate) {
        await onBatchCopy(selectedEvents, 'weekly', { startDate, endDate });
      } else if (copyMode === 'daily' && targetDate) {
        await onBatchCopy(selectedEvents, 'daily', { targetDate });
      }
    } finally {
      setCopying(false);
    }
  };

  // ── Deduplication ─────────────────────────────────────────────────────────
  const getDuplicates = (): Event[] => {
    const base = isFiltered ? filteredEvents : events;
    const sorted = [...base].sort((a, b) => a.date.localeCompare(b.date));
    const seen = new Set<string>();
    const duplicates: Event[] = [];
    for (const ev of sorted) {
      const key = `${ev.date}-${ev.title}-${hhmm(ev.start_time)}`;
      if (seen.has(key)) {
        duplicates.push(ev);
      } else {
        seen.add(key);
      }
    }
    return duplicates;
  };

  // Month mode sorted days (Mon first)
  const sortedDays = [1, 2, 3, 4, 5, 6, 0].filter((d) => groupedUnique.has(d));

  // ── Render helpers ────────────────────────────────────────────────────────
  const renderEventRow = (key: string, event: Event, count = 1) => (
    <div
      key={key}
      onClick={() => toggleEvent(key)}
      className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 transition-colors ${
        selectedIds.has(key) ? 'border-primary bg-primary/10' : 'border-border/50 hover:bg-card-hover'
      }`}
    >
      <input
        type="checkbox"
        checked={selectedIds.has(key)}
        onChange={() => toggleEvent(key)}
        onClick={(e) => e.stopPropagation()}
        className="h-4 w-4 shrink-0 accent-primary"
      />
      <div className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: event.color }} />
      <div className="min-w-0 flex-1">
        <span className="text-sm font-medium">{event.title}</span>
        {event.start_time && (
          <span className="ml-2 text-xs text-muted">
            {hhmm(event.start_time)}
            {event.end_time ? ` - ${hhmm(event.end_time)}` : ''}
          </span>
        )}
        {count > 1 && (
          <span className="ml-2 rounded bg-card-hover px-1.5 py-0.5 text-xs text-muted" title="이 달에 같은 일정이 있는 횟수">
            {count}개
          </span>
        )}
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onEditEvent(event); }}
        className="shrink-0 rounded-md p-1.5 text-muted transition-colors hover:bg-card-hover hover:text-foreground"
        title="수정"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
      </button>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60" {...backdrop}>
      <div className="flex max-h-[85vh] w-full max-w-xl flex-col rounded-xl bg-card shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-lg font-bold">선택 모드<span className="ml-2 text-sm font-normal text-muted">({weekMode ? '이번 주' : monthLabel ?? '이번 달'})</span></h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted hover:bg-card-hover hover:text-foreground">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Event list */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm text-muted">이벤트를 선택하세요</span>
            <button onClick={toggleAll} className="text-xs text-primary hover:underline">
              {allSelected ? '전체 해제' : '전체 선택'}
            </button>
          </div>

          {/* Week mode: group by date */}
          {weekMode && (
            <>
              {!weekGroups || weekGroups.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted">이번 주에 이벤트가 없습니다</div>
              ) : (
                <div className="space-y-4">
                  {weekGroups.map(([date, dayEvents]) => {
                    const d = new Date(date + 'T00:00:00');
                    const dow = d.getDay();
                    const label = `${d.getMonth() + 1}/${d.getDate()} (${DAY_NAMES[dow]})`;
                    return (
                      <div key={date}>
                        <div className={`mb-2 text-sm font-medium ${dow === 0 ? 'text-danger' : dow === 6 ? 'text-primary' : 'text-muted'}`}>
                          {label}
                        </div>
                        <div className="space-y-1.5">
                          {dayEvents
                            .sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''))
                            .map((ev) => renderEventRow(ev.id, ev))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* Month mode: date filter + event list */}
          {!weekMode && (
            <>
              {/* Date filter */}
              <div className="mb-4 rounded-lg border border-border/60 bg-card-hover/40 px-3 py-3">
                <div className="mb-2 text-xs font-medium text-muted">날짜 필터</div>
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={filterFrom}
                    onChange={(e) => { setFilterFrom(e.target.value); setSelectedIds(new Set()); }}
                    className="flex-1 rounded-lg border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
                  />
                  <span className="text-xs text-muted">~</span>
                  <input
                    type="date"
                    value={filterTo}
                    onChange={(e) => { setFilterTo(e.target.value); setSelectedIds(new Set()); }}
                    className="flex-1 rounded-lg border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
                  />
                  {filterFrom && (
                    <button
                      onClick={() => { setFilterFrom(''); setFilterTo(''); setSelectedIds(new Set()); }}
                      className="shrink-0 rounded-md p-1 text-muted hover:text-foreground"
                      title="필터 초기화"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M18 6L6 18M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
                {filterFrom && (() => {
                  const dupes = getDuplicates();
                  return dupes.length > 0 ? (
                    <button
                      onClick={() => {
                        if (confirm(`중복 이벤트 ${dupes.length}개를 삭제할까요? (각 날짜·제목·시간 기준으로 첫 번째만 남깁니다)`)) {
                          onBatchDelete(dupes);
                        }
                      }}
                      className="mt-2 w-full rounded-lg border border-warning/40 bg-warning/10 py-1.5 text-xs font-medium text-warning transition-colors hover:bg-warning/20"
                    >
                      중복 없애기 ({dupes.length}개 발견)
                    </button>
                  ) : (
                    <div className="mt-2 text-center text-xs text-muted">중복 없음</div>
                  );
                })()}
              </div>

              {/* Filtered: individual events by date */}
              {isFiltered && (
                <>
                  {!filteredGroups || filteredGroups.length === 0 ? (
                    <div className="py-8 text-center text-sm text-muted">해당 날짜에 이벤트가 없습니다</div>
                  ) : (
                    <div className="space-y-4">
                      {filteredGroups.map(([date, dayEvents]) => {
                        const d = new Date(date + 'T00:00:00');
                        const dow = d.getDay();
                        const label = `${d.getMonth() + 1}/${d.getDate()} (${DAY_NAMES[dow]})`;
                        return (
                          <div key={date}>
                            <div className={`mb-2 text-sm font-medium ${dow === 0 ? 'text-danger' : dow === 6 ? 'text-primary' : 'text-muted'}`}>
                              {label}
                            </div>
                            <div className="space-y-1.5">
                              {dayEvents
                                .sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''))
                                .map((ev) => renderEventRow(ev.id, ev))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}

              {/* Unfiltered: dedup by weekday */}
              {!isFiltered && (
                <>
                  {sortedDays.length === 0 ? (
                    <div className="py-8 text-center text-sm text-muted">표시할 이벤트가 없습니다</div>
                  ) : (
                    <div className="space-y-4">
                      {sortedDays.map((dow) => (
                        <div key={dow}>
                          <div className={`mb-2 text-sm font-medium ${dow === 0 ? 'text-danger' : dow === 6 ? 'text-primary' : 'text-muted'}`}>
                            {DAY_NAMES[dow]}요일
                          </div>
                          <div className="space-y-1.5">
                            {groupedUnique.get(dow)!
                              .sort((a, b) => (a.event.start_time || '').localeCompare(b.event.start_time || ''))
                              .map(({ key, event }) => renderEventRow(key, event, patternGroups.get(key)?.length ?? 1))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>

        {/* Actions */}
        {activeKeys.length > 0 && (
          <div className="border-t border-border px-6 py-4">
            <div className="mb-3 text-sm font-medium">
              {activeKeys.length}개 선택됨
              {eventsToDelete.length !== activeKeys.length && (
                <span className="ml-2 font-normal text-muted">(삭제 시 일정 {eventsToDelete.length}개)</span>
              )}
            </div>

            {/* Delete */}
            <button
              onClick={handleDelete}
              className="mb-3 w-full rounded-lg border border-danger/40 bg-danger/10 py-2.5 text-sm font-medium text-danger transition-colors hover:bg-danger/20"
            >
              선택 삭제
            </button>

            {/* Divider */}
            <div className="mb-3 flex items-center gap-2 text-xs text-muted">
              <div className="flex-1 border-t border-border" />
              복사 방식
              <div className="flex-1 border-t border-border" />
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setCopyMode('weekly')}
                className={`flex-1 rounded-lg border py-2.5 text-sm font-medium transition-colors ${
                  copyMode === 'weekly' ? 'border-primary bg-primary text-white' : 'border-border hover:bg-card-hover'
                }`}
              >
                매주 반복
              </button>
              <button
                onClick={() => setCopyMode('daily')}
                className={`flex-1 rounded-lg border py-2.5 text-sm font-medium transition-colors ${
                  copyMode === 'daily' ? 'border-primary bg-primary text-white' : 'border-border hover:bg-card-hover'
                }`}
              >
                하루에 넣기
              </button>
            </div>

            {/* Weekly options */}
            {copyMode === 'weekly' && (
              <div className="mt-3 space-y-2">
                <div className="text-xs text-muted">선택한 이벤트가 각 요일에 매주 반복됩니다 (이미 있거나 시간이 겹치는 날은 건너뜁니다)</div>
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <label className="mb-1 block text-xs text-muted">시작일</label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                    />
                  </div>
                  <span className="mt-5 text-muted">~</span>
                  <div className="flex-1">
                    <label className="mb-1 block text-xs text-muted">종료일</label>
                    <input
                      type="date"
                      value={endDate}
                      min={startDate || undefined}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Daily options */}
            {copyMode === 'daily' && (
              <div className="mt-3 space-y-2">
                <div className="text-xs text-muted">선택한 모든 이벤트를 지정한 날짜에 복사합니다</div>
                <div>
                  <label className="mb-1 block text-xs text-muted">대상 날짜</label>
                  <input
                    type="date"
                    value={targetDate}
                    onChange={(e) => setTargetDate(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                </div>
              </div>
            )}

            {/* Confirm copy */}
            {copyMode && (
              <button
                onClick={handleCopy}
                disabled={
                  copying ||
                  (copyMode === 'weekly' && (!startDate || !endDate)) ||
                  (copyMode === 'daily' && !targetDate)
                }
                className="mt-3 w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-hover disabled:opacity-50"
              >
                {copying ? '복사 중...' : '복사하기'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
