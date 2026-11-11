'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { Event } from '@/lib/supabase';
import { fmtDate, fromMin, hhmm, layoutColumns, timeRange } from '@/lib/time';

const DAYS = ['일', '월', '화', '수', '목', '금', '토'];
// 6시부터 시작, 0-5시는 아래로
const DAY_START_HOUR = 6;
const HOURS = [
  ...Array.from({ length: 24 - DAY_START_HOUR }, (_, i) => i + DAY_START_HOUR),
  ...Array.from({ length: DAY_START_HOUR }, (_, i) => i),
];
const WRAP_MIN = DAY_START_HOUR * 60;
const ROW_H = 64;

type Props = {
  year: number;
  month: number;
  day: number;
  events: Event[];
  onTimeClick: (date: string, time: string, endTime?: string) => void;
  onTimeRangeSelect: (dates: string[], startTime: string, endTime: string) => void;
  onAllDayClick: (date: string) => void;
  onEventClick: (event: Event) => void;
  onToggleDone: (eventId: string) => void;
  /** newStartTime: "HH:MM" for a time cell, null for the all-day row */
  onMoveEvent: (eventId: string, newDate: string, newStartTime: string | null) => void;
  onSwapEvents: (sourceId: string, targetId: string) => void;
  onCopyEvent: (event: Event, newDate: string, newStartTime: string | null) => void;
  onResizeFill: (source: Event, targetDate: string, targetEndHour: number) => void;
  pasteSource?: Event | null;
  onPasteClick?: (date: string, time: string | null) => void;
  onCancelPaste?: () => void;
};

/** One drawn block. An event that crosses 06:00 is drawn as two (bottom of the grid + top). */
type Segment = {
  ev: Event;
  startMin: number;
  endMin: number;
  isLast: boolean;
  col: number;
  cols: number;
};

function getWeekDates(year: number, month: number, day: number) {
  const date = new Date(year, month, day);
  const dayOfWeek = date.getDay();
  const dates: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(date);
    d.setDate(date.getDate() - dayOfWeek + i);
    dates.push(d);
  }
  return dates;
}

// The grid shows 06–23 on top and 00–05 below. A drag must stay inside the block
// of rows it started in, otherwise "23시 → 00시" would silently mean the whole day.
function clampToBlock(anchorHour: number, hour: number) {
  if (anchorHour >= DAY_START_HOUR) return hour < DAY_START_HOUR ? 23 : hour;
  return hour >= DAY_START_HOUR ? 0 : hour;
}

const hourLabel = (hour: number) => `${String(hour).padStart(2, '0')}:00`;

export default function WeekView({ year, month, day, events, onTimeClick, onTimeRangeSelect, onAllDayClick, onEventClick, onToggleDone, onMoveEvent, onSwapEvents, onCopyEvent, onResizeFill, pasteSource, onPasteClick, onCancelPaste }: Props) {
  const weekDates = useMemo(() => getWeekDates(year, month, day), [year, month, day]);
  const weekDateStrs = useMemo(() => weekDates.map(fmtDate), [weekDates]);
  const todayStr = fmtDate(new Date());

  // HTML5 drag (move / swap)
  const [dragOverCell, setDragOverCell] = useState<string | null>(null);
  const [dragOverEventId, setDragOverEventId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const dragIdRef = useRef<string | null>(null);

  // Range selection (left-click drag on empty cells) — 2D rectangle across days × hours
  const [rangeStart, setRangeStart] = useState<{ dateIdx: number; hour: number } | null>(null);
  const [rangeEnd, setRangeEnd] = useState<{ dateIdx: number; hour: number } | null>(null);
  const rangeProcessed = useRef(false);

  // Right-click copy
  const [copySource, setCopySource] = useState<Event | null>(null);
  const [copyTargetKey, setCopyTargetKey] = useState<string | null>(null);
  const copyTargetRef = useRef<{ date: string; time: string | null } | null>(null);

  // Resize/fill drag (bottom-right handle on time-grid events)
  const [resizeSource, setResizeSource] = useState<Event | null>(null);
  const [resizeTarget, setResizeTarget] = useState<{ date: string; hour: number } | null>(null);
  const resizeTargetRef = useRef<{ date: string; hour: number } | null>(null);
  const resizeMovedRef = useRef(false);

  // Cleanup range on global mouseup
  useEffect(() => {
    const cleanup = () => {
      setTimeout(() => {
        if (!rangeProcessed.current) {
          setRangeStart(null);
          setRangeEnd(null);
        }
        rangeProcessed.current = false;
      }, 0);
    };
    document.addEventListener('mouseup', cleanup);
    return () => document.removeEventListener('mouseup', cleanup);
  }, []);

  // Resize/fill: track mouse target and commit on release
  useEffect(() => {
    if (!resizeSource) return;
    const range = timeRange(resizeSource);
    const startHour = range ? Math.floor(range[0] / 60) : 0;

    const handleMove = (e: MouseEvent) => {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const cell = el?.closest('[data-cell-date][data-cell-hour]') as HTMLElement | null;
      if (!cell) return;
      const date = cell.getAttribute('data-cell-date')!;
      const cellHour = parseInt(cell.getAttribute('data-cell-hour')!);
      // The end can't go above the start row or into the other block of rows
      const hour = Math.max(startHour, clampToBlock(startHour, cellHour));
      const prev = resizeTargetRef.current;
      if (prev && prev.date === date && prev.hour === hour) return;
      resizeMovedRef.current = true;
      resizeTargetRef.current = { date, hour };
      setResizeTarget({ date, hour });
    };

    const handleUp = () => {
      const target = resizeTargetRef.current;
      // A plain click on the handle (no drag to another cell) must not change anything
      if (target && resizeMovedRef.current) {
        onResizeFill(resizeSource, target.date, target.hour);
      }
      setResizeSource(null);
      setResizeTarget(null);
      resizeTargetRef.current = null;
      resizeMovedRef.current = false;
    };

    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
    return () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };
  }, [resizeSource, onResizeFill]);

  // Cancel paste mode on Escape
  useEffect(() => {
    if (!pasteSource) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancelPaste?.();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [pasteSource, onCancelPaste]);

  // Right-click copy: track mouse and handle drop
  useEffect(() => {
    if (!copySource) return;

    const handleMove = (e: MouseEvent) => {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const cell = el?.closest('[data-cell-date]') as HTMLElement | null;
      if (cell) {
        const date = cell.getAttribute('data-cell-date')!;
        const hour = cell.getAttribute('data-cell-hour');
        copyTargetRef.current = { date, time: hour !== null ? hourLabel(parseInt(hour)) : null };
        setCopyTargetKey(`${date}-${hour}`);
      } else {
        copyTargetRef.current = null;
        setCopyTargetKey(null);
      }
    };

    const handleUp = () => {
      const target = copyTargetRef.current;
      // Releasing on the event's own cell is not a copy
      const ownCell =
        !!target &&
        target.date === copySource.date &&
        (target.time === null
          ? !copySource.start_time
          : !!copySource.start_time && target.time.slice(0, 2) === copySource.start_time.slice(0, 2));
      if (target && !ownCell) {
        onCopyEvent(copySource, target.date, target.time);
      }
      setCopySource(null);
      setCopyTargetKey(null);
      copyTargetRef.current = null;
    };

    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
    return () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };
  }, [copySource, onCopyEvent]);

  // Blocks to draw, keyed by the cell ("date-hour") they start in.
  // Overlapping events share the column width instead of hiding each other.
  const segmentsByCell = useMemo(() => {
    const map = new Map<string, Segment[]>();
    const add = (date: string, hour: number, seg: Segment) => {
      const key = `${date}-${hour}`;
      const list = map.get(key);
      if (list) list.push(seg);
      else map.set(key, [seg]);
    };
    for (const date of weekDateStrs) {
      const dayEvents = events.filter((e) => e.date === date && e.start_time);
      const layout = layoutColumns(dayEvents);
      for (const ev of dayEvents) {
        const range = timeRange(ev);
        if (!range) continue;
        const [start, end] = range;
        const { col, cols } = layout.get(ev.id) ?? { col: 0, cols: 1 };
        const crossesWrap = start < WRAP_MIN && end > WRAP_MIN;
        add(date, Math.floor(start / 60), {
          ev, startMin: start, endMin: crossesWrap ? WRAP_MIN : end, isLast: !crossesWrap, col, cols,
        });
        if (crossesWrap) {
          add(date, DAY_START_HOUR, { ev, startMin: WRAP_MIN, endMin: end, isLast: true, col, cols });
        }
      }
    }
    return map;
  }, [events, weekDateStrs]);

  const getAllDayEvents = (dateStr: string) =>
    events.filter((e) => e.date === dateStr && !e.start_time);

  const isInRange = (dateIdx: number, hour: number) => {
    if (!rangeStart || !rangeEnd) return false;
    const minIdx = Math.min(rangeStart.dateIdx, rangeEnd.dateIdx);
    const maxIdx = Math.max(rangeStart.dateIdx, rangeEnd.dateIdx);
    const minH = Math.min(rangeStart.hour, rangeEnd.hour);
    const maxH = Math.max(rangeStart.hour, rangeEnd.hour);
    return dateIdx >= minIdx && dateIdx <= maxIdx && hour >= minH && hour <= maxH;
  };

  const isCopyTarget = (cellKey: string) => copyTargetKey === cellKey;

  // Is this cell inside the active resize-fill rectangle?
  const isResizeArea = (dateStr: string, hour: number) => {
    if (!resizeSource || !resizeTarget) return false;
    const range = timeRange(resizeSource);
    if (!range) return false;
    const startHour = Math.floor(range[0] / 60);
    const sourceIdx = weekDateStrs.indexOf(resizeSource.date);
    const targetIdx = weekDateStrs.indexOf(resizeTarget.date);
    const cellIdx = weekDateStrs.indexOf(dateStr);
    if (sourceIdx < 0 || targetIdx < 0 || cellIdx < 0) return false;
    const minIdx = Math.min(sourceIdx, targetIdx);
    const maxIdx = Math.max(sourceIdx, targetIdx);
    return cellIdx >= minIdx && cellIdx <= maxIdx && hour >= startHour && hour <= resizeTarget.hour;
  };

  // While another gesture is in progress, events let the pointer through to the cells below
  const gestureActive = !!copySource || !!resizeSource || !!rangeStart || !!pasteSource;

  const clearDragState = () => {
    dragIdRef.current = null;
    setDraggingId(null);
    setDragOverCell(null);
    setDragOverEventId(null);
  };

  // Shared drag/swap/copy/click wiring for an event block (time grid and all-day row)
  const eventHandlers = (ev: Event) => ({
    'data-event-id': ev.id,
    draggable: !gestureActive,
    onDragStart: (e: React.DragEvent) => {
      if (gestureActive) {
        e.preventDefault();
        return;
      }
      e.dataTransfer.setData('eventId', ev.id);
      e.dataTransfer.effectAllowed = 'move';
      dragIdRef.current = ev.id;
      // Deferred so the browser snapshots the drag image before the block fades
      // and stops catching the pointer (see pointerEvents below).
      setTimeout(() => {
        if (dragIdRef.current === ev.id) setDraggingId(ev.id);
      }, 0);
    },
    onDragEnd: clearDragState,
    onDragOver: (e: React.DragEvent) => {
      if (!dragIdRef.current || dragIdRef.current === ev.id) return;
      e.preventDefault();
      e.stopPropagation();
      setDragOverEventId(ev.id);
      setDragOverCell(null);
    },
    onDragLeave: () => setDragOverEventId((prev) => (prev === ev.id ? null : prev)),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const sourceId = e.dataTransfer.getData('eventId');
      clearDragState();
      if (!sourceId || sourceId === ev.id) return;
      onSwapEvents(sourceId, ev.id);
    },
    onMouseDown: (e: React.MouseEvent) => {
      e.stopPropagation();
      if (e.button === 2) setCopySource(ev);
    },
    onClick: (e: React.MouseEvent) => {
      e.stopPropagation();
      onEventClick(ev);
    },
  });

  const eventStyle = (ev: Event) => ({
    backgroundColor: ev.color,
    // The dragged block itself must not be a drop target, or moving a long event
    // by less than its own height would drop it onto itself and do nothing.
    pointerEvents: gestureActive || draggingId === ev.id ? ('none' as const) : ('auto' as const),
    opacity: draggingId === ev.id ? 0.3 : ev.done ? 0.5 : 0.9,
  });

  return (
    <div data-tour="calendar" className="flex flex-1 select-none flex-col overflow-hidden" onContextMenu={(e) => e.preventDefault()}>
      {/* Header */}
      <div className="grid grid-cols-[70px_repeat(7,minmax(0,1fr))] border-b border-border">
        <div />
        {weekDates.map((d, i) => {
          const isToday = weekDateStrs[i] === todayStr;
          return (
            <div key={i} className="border-l border-border/50 py-3 text-center">
              <div className={`text-sm ${i === 0 ? 'text-danger' : i === 6 ? 'text-primary' : 'text-muted'}`}>
                {DAYS[i]}
              </div>
              <div
                className={`mx-auto mt-1 flex h-9 w-9 items-center justify-center rounded-full text-base font-medium ${
                  isToday ? 'bg-primary text-white' : ''
                }`}
              >
                {d.getDate()}
              </div>
            </div>
          );
        })}
      </div>

      {/* All-day events */}
      <div className="grid grid-cols-[70px_repeat(7,minmax(0,1fr))] border-b border-border">
        <div className="flex items-center justify-center text-xs text-muted">종일</div>
        {weekDateStrs.map((dateStr, i) => {
          const allDay = getAllDayEvents(dateStr);
          const highlighted = dragOverCell === `allday-${dateStr}` || isCopyTarget(`${dateStr}-null`);
          return (
            <div
              key={i}
              className={`flex min-h-[32px] flex-col gap-0.5 overflow-hidden border-l border-border/50 p-1 ${
                pasteSource ? 'cursor-copy' : 'cursor-pointer'
              } ${highlighted ? 'bg-primary/20' : draggingId ? '' : 'hover:bg-card-hover/50'}`}
              data-cell-date={dateStr}
              onClick={() => {
                if (pasteSource) onPasteClick?.(dateStr, null);
                else onAllDayClick(dateStr);
              }}
              onDragOver={(e) => {
                if (!dragIdRef.current) return;
                e.preventDefault();
                setDragOverCell(`allday-${dateStr}`);
              }}
              onDragLeave={() => setDragOverCell((prev) => (prev === `allday-${dateStr}` ? null : prev))}
              onDrop={(e) => {
                e.preventDefault();
                const eventId = e.dataTransfer.getData('eventId');
                clearDragState();
                if (eventId) onMoveEvent(eventId, dateStr, null);
              }}
            >
              {allDay.map((ev) => (
                <div
                  key={ev.id}
                  {...eventHandlers(ev)}
                  className={`flex min-w-0 cursor-grab items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium text-white active:cursor-grabbing ${
                    dragOverEventId === ev.id ? 'ring-2 ring-white' : ''
                  }`}
                  style={eventStyle(ev)}
                  title={ev.title}
                >
                  <input
                    type="checkbox"
                    checked={ev.done}
                    onClick={(e) => e.stopPropagation()}
                    onChange={() => onToggleDone(ev.id)}
                    className="h-3 w-3 shrink-0 cursor-pointer accent-white"
                  />
                  <span className={`min-w-0 flex-1 truncate ${ev.done ? 'line-through' : ''}`}>{ev.title}</span>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {/* Time grid */}
      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-[70px_repeat(7,minmax(0,1fr))]">
          {HOURS.map((hour) => (
            <div key={hour} className="contents">
              <div className="relative h-16 border-b border-border/30 pr-3 text-right">
                <span className="text-xs text-muted">{hourLabel(hour)}</span>
              </div>
              {weekDateStrs.map((dateStr, di) => {
                const cellKey = `${dateStr}-${hour}`;
                const segments = segmentsByCell.get(cellKey) ?? [];
                const isDragOver = dragOverCell === cellKey;
                const inRange = isInRange(di, hour);
                const isCopy = isCopyTarget(cellKey);
                const inResize = isResizeArea(dateStr, hour);
                return (
                  <div
                    key={di}
                    data-cell-date={dateStr}
                    data-cell-hour={String(hour)}
                    className={`relative h-16 border-b border-l border-border/30 transition-colors ${
                      pasteSource ? 'cursor-copy' : 'cursor-pointer'
                    } ${draggingId ? '' : 'hover:bg-card-hover/50'} ${
                      inResize ? 'bg-warning/30' : isDragOver || isCopy ? 'bg-primary/20' : inRange ? 'bg-success/20' : ''
                    }`}
                    onClick={() => {
                      if (pasteSource) onPasteClick?.(dateStr, hourLabel(hour));
                    }}
                    // Range selection (2D: across days and hours)
                    onMouseDown={(e) => {
                      if (e.button === 0 && e.target === e.currentTarget && !gestureActive) {
                        setRangeStart({ dateIdx: di, hour });
                        setRangeEnd({ dateIdx: di, hour });
                      }
                    }}
                    onMouseEnter={() => {
                      if (rangeStart) {
                        setRangeEnd({ dateIdx: di, hour: clampToBlock(rangeStart.hour, hour) });
                      }
                    }}
                    onMouseUp={(e) => {
                      if (rangeStart && rangeEnd && e.button === 0) {
                        const minIdx = Math.min(rangeStart.dateIdx, rangeEnd.dateIdx);
                        const maxIdx = Math.max(rangeStart.dateIdx, rangeEnd.dateIdx);
                        const minH = Math.min(rangeStart.hour, rangeEnd.hour);
                        const maxH = Math.max(rangeStart.hour, rangeEnd.hour);
                        rangeProcessed.current = true;
                        const dates = weekDateStrs.slice(minIdx, maxIdx + 1);
                        const startTime = hourLabel(minH);
                        const endTime = fromMin((maxH + 1) * 60);
                        if (dates.length > 1) {
                          onTimeRangeSelect(dates, startTime, endTime);
                        } else if (minH !== maxH) {
                          onTimeClick(dates[0], startTime, endTime);
                        } else {
                          onTimeClick(dates[0], startTime);
                        }
                        setRangeStart(null);
                        setRangeEnd(null);
                      }
                    }}
                    // Move drag (HTML5)
                    onDragOver={(e) => {
                      if (!dragIdRef.current) return;
                      e.preventDefault();
                      setDragOverCell(cellKey);
                    }}
                    onDragLeave={() => setDragOverCell((prev) => (prev === cellKey ? null : prev))}
                    onDrop={(e) => {
                      e.preventDefault();
                      const eventId = e.dataTransfer.getData('eventId');
                      clearDragState();
                      if (eventId) onMoveEvent(eventId, dateStr, hourLabel(hour));
                    }}
                  >
                    {segments.map((seg) => {
                      const { ev } = seg;
                      const top = ((seg.startMin % 60) / 60) * ROW_H;
                      const height = Math.max(((seg.endMin - seg.startMin) / 60) * ROW_H, 22);
                      const widthPct = 100 / seg.cols;
                      return (
                        <div
                          key={`${ev.id}-${seg.startMin}`}
                          {...eventHandlers(ev)}
                          className={`absolute z-[1] cursor-grab overflow-hidden rounded px-1.5 py-0.5 text-xs font-medium text-white active:cursor-grabbing ${
                            dragOverEventId === ev.id ? 'ring-2 ring-white' : ''
                          }`}
                          style={{
                            ...eventStyle(ev),
                            top: `${top}px`,
                            height: `${height - 1}px`,
                            left: `calc(${seg.col * widthPct}% + 2px)`,
                            width: `calc(${widthPct}% - 4px)`,
                          }}
                          title={`${ev.title} ${hhmm(ev.start_time)}${ev.end_time ? ` - ${hhmm(ev.end_time)}` : ''}`}
                        >
                          <div className="flex items-center gap-1">
                            <input
                              type="checkbox"
                              checked={ev.done}
                              onClick={(e) => e.stopPropagation()}
                              onChange={() => onToggleDone(ev.id)}
                              className="h-3 w-3 shrink-0 cursor-pointer accent-white"
                            />
                            <span className={`min-w-0 flex-1 truncate ${ev.done ? 'line-through' : ''}`}>{ev.title}</span>
                          </div>
                          {height > 30 && (
                            <div className={`truncate pl-4 text-[11px] opacity-70 ${ev.done ? 'line-through' : ''}`}>
                              {hhmm(ev.start_time)}{ev.end_time ? ` - ${hhmm(ev.end_time)}` : ''}
                            </div>
                          )}
                          {/* Resize/fill handle (bottom-right) */}
                          {seg.isLast && (
                            <div
                              data-tour="resize-handle"
                              draggable={false}
                              onDragStart={(e) => e.preventDefault()}
                              onClick={(e) => e.stopPropagation()}
                              onMouseDown={(e) => {
                                if (e.button !== 0) return;
                                e.preventDefault();
                                e.stopPropagation();
                                const range = timeRange(ev);
                                if (!range) return;
                                // Start the highlight at the event's current extent
                                const startHour = Math.floor(range[0] / 60);
                                const lastHour = Math.max(startHour, Math.floor((range[1] - 1) / 60));
                                const initial = { date: ev.date, hour: lastHour };
                                resizeTargetRef.current = initial;
                                resizeMovedRef.current = false;
                                setResizeSource(ev);
                                setResizeTarget(initial);
                              }}
                              className="absolute bottom-0 right-0 h-4 w-4 cursor-se-resize rounded-tl bg-white/80 hover:bg-white"
                              title="끌어서 늘리기 / 다른 날로 채우기"
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Copy mode indicator */}
      {copySource && (
        <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white shadow-lg">
          복사 중: {copySource.title}
        </div>
      )}

      {/* Click-paste mode indicator */}
      {pasteSource && (
        <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white shadow-lg">
          <span>복사할 위치를 클릭하세요: {pasteSource.title}</span>
          <button
            onClick={() => onCancelPaste?.()}
            className="rounded p-1 hover:bg-white/20"
            title="취소 (ESC)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
