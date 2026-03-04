'use client';

import { useState } from 'react';
import { Event } from '@/lib/supabase';

const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];

type CopyMode = 'weekly' | 'daily' | null;

type Props = {
  events: Event[];
  weekMode?: boolean;
  onClose: () => void;
  onBatchCopy: (events: Event[], mode: 'weekly' | 'daily', options: { startDate?: string; endDate?: string; targetDate?: string }) => void;
  onBatchDelete: (events: Event[]) => void;
};

export default function SelectMode({ events, weekMode = false, onClose, onBatchCopy, onBatchDelete }: Props) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [copyMode, setCopyMode] = useState<CopyMode>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [copying, setCopying] = useState(false);

  // ── Week mode: group by actual date, no dedup ──────────────────────────────
  const weekGroups = (() => {
    if (!weekMode) return null;
    const map = new Map<string, Event[]>(); // date string → events
    events.forEach((ev) => {
      if (!map.has(ev.date)) map.set(ev.date, []);
      map.get(ev.date)!.push(ev);
    });
    // Sort dates Sun→Sat
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  })();

  const weekTotalCount = events.length;

  // ── Month mode: dedup by weekday + title + time ───────────────────────────
  const uniqueEvents = (() => {
    if (weekMode) return new Map<string, Event>();
    const map = new Map<string, Event>();
    events.forEach((ev) => {
      const dow = new Date(ev.date + 'T00:00:00').getDay();
      const key = `${dow}-${ev.title}-${ev.start_time || ''}-${ev.end_time || ''}`;
      if (!map.has(key)) map.set(key, ev);
    });
    return map;
  })();

  const groupedUnique = (() => {
    if (weekMode) return new Map<number, { key: string; event: Event }[]>();
    const map = new Map<number, { key: string; event: Event }[]>();
    uniqueEvents.forEach((ev, key) => {
      const dow = parseInt(key.split('-')[0]);
      if (!map.has(dow)) map.set(dow, []);
      map.get(dow)!.push({ key, event: ev });
    });
    return map;
  })();

  const totalCount = weekMode ? weekTotalCount : uniqueEvents.size;

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
    if (selectedIds.size === totalCount) {
      setSelectedIds(new Set());
    } else {
      if (weekMode) {
        setSelectedIds(new Set(events.map((e) => e.id)));
      } else {
        setSelectedIds(new Set(uniqueEvents.keys()));
      }
    }
  };

  const selectedEvents = weekMode
    ? events.filter((e) => selectedIds.has(e.id))
    : (Array.from(selectedIds).map((k) => uniqueEvents.get(k)).filter(Boolean) as Event[]);

  const handleCopy = async () => {
    if (selectedEvents.length === 0) return;
    setCopying(true);
    if (copyMode === 'weekly' && startDate && endDate) {
      onBatchCopy(selectedEvents, 'weekly', { startDate, endDate });
    } else if (copyMode === 'daily' && targetDate) {
      onBatchCopy(selectedEvents, 'daily', { targetDate });
    }
  };

  // Month mode sorted days (Mon first)
  const sortedDays = [1, 2, 3, 4, 5, 6, 0].filter((d) => groupedUnique.has(d));

  // ── Render helpers ────────────────────────────────────────────────────────
  const renderEventRow = (key: string, event: Event) => (
    <label
      key={key}
      className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 transition-colors ${
        selectedIds.has(key) ? 'border-primary bg-primary/10' : 'border-border/50 hover:bg-card-hover'
      }`}
    >
      <input
        type="checkbox"
        checked={selectedIds.has(key)}
        onChange={() => toggleEvent(key)}
        className="h-4 w-4 accent-primary"
      />
      <div className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: event.color }} />
      <div className="min-w-0 flex-1">
        <span className="text-sm font-medium">{event.title}</span>
        {event.start_time && (
          <span className="ml-2 text-xs text-muted">
            {event.start_time.slice(0, 5)}
            {event.end_time ? ` - ${event.end_time.slice(0, 5)}` : ''}
          </span>
        )}
      </div>
    </label>
  );

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-xl flex-col rounded-xl bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-lg font-bold">선택 모드{weekMode && <span className="ml-2 text-sm font-normal text-muted">(이번 주)</span>}</h2>
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
              {selectedIds.size === totalCount ? '전체 해제' : '전체 선택'}
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

          {/* Month mode: dedup by weekday */}
          {!weekMode && (
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
                          .map(({ key, event }) => renderEventRow(key, event))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Actions */}
        {selectedIds.size > 0 && (
          <div className="border-t border-border px-6 py-4">
            <div className="mb-3 text-sm font-medium">{selectedIds.size}개 선택됨</div>

            {/* Delete */}
            <button
              onClick={() => onBatchDelete(selectedEvents)}
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
                <div className="text-xs text-muted">선택한 이벤트가 각 요일에 매주 반복됩니다</div>
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
