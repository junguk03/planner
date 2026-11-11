'use client';

import { useState, useRef, useEffect } from 'react';
import { Event } from '@/lib/supabase';
import { fmtDate, hhmm } from '@/lib/time';

const DAYS = ['일', '월', '화', '수', '목', '금', '토'];

type Props = {
  year: number;
  month: number;
  events: Event[];
  onDateClick: (date: string) => void;
  onDateRangeSelect: (dates: string[]) => void;
  onEventClick: (event: Event) => void;
  onToggleDone: (eventId: string) => void;
  /** Moves to another day; the event keeps its time */
  onMoveEvent: (eventId: string, newDate: string) => void;
  onSwapEvents: (sourceId: string, targetId: string) => void;
  onCopyEvent: (event: Event, newDate: string) => void;
  pasteSource?: Event | null;
  onPasteClick?: (date: string) => void;
  onCancelPaste?: () => void;
};

export default function MonthView({ year, month, events, onDateClick, onDateRangeSelect, onEventClick, onToggleDone, onMoveEvent, onSwapEvents, onCopyEvent, pasteSource, onPasteClick, onCancelPaste }: Props) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayStr = fmtDate(new Date());

  // HTML5 drag (move / swap)
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);
  const [dragOverEventId, setDragOverEventId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const dragIdRef = useRef<string | null>(null);

  // Date range selection (left-click drag on empty area)
  const [rangeStartDay, setRangeStartDay] = useState<number | null>(null);
  const [rangeEndDay, setRangeEndDay] = useState<number | null>(null);
  const rangeProcessed = useRef(false);

  useEffect(() => {
    const cleanup = () => {
      setTimeout(() => {
        if (!rangeProcessed.current) {
          setRangeStartDay(null);
          setRangeEndDay(null);
        }
        rangeProcessed.current = false;
      }, 0);
    };
    document.addEventListener('mouseup', cleanup);
    return () => document.removeEventListener('mouseup', cleanup);
  }, []);

  // Right-click copy
  const [copySource, setCopySource] = useState<Event | null>(null);
  const [copyTargetDate, setCopyTargetDate] = useState<string | null>(null);
  const copyTargetRef = useRef<string | null>(null);

  // Cancel paste mode on Escape
  useEffect(() => {
    if (!pasteSource) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancelPaste?.();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [pasteSource, onCancelPaste]);

  useEffect(() => {
    if (!copySource) return;

    const handleMove = (e: MouseEvent) => {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const cell = el?.closest('[data-month-date]') as HTMLElement | null;
      if (cell) {
        const date = cell.getAttribute('data-month-date')!;
        copyTargetRef.current = date;
        setCopyTargetDate(date);
      } else {
        copyTargetRef.current = null;
        setCopyTargetDate(null);
      }
    };

    const handleUp = () => {
      // Releasing on the event's own day is not a copy
      if (copyTargetRef.current && copyTargetRef.current !== copySource.date) {
        onCopyEvent(copySource, copyTargetRef.current);
      }
      setCopySource(null);
      setCopyTargetDate(null);
      copyTargetRef.current = null;
    };

    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
    return () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };
  }, [copySource, onCopyEvent]);

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const getDateStr = (day: number) =>
    `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  const getEventsForDay = (day: number) =>
    events.filter((e) => e.date === getDateStr(day))
      .sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));

  const isInSelectedRange = (day: number) => {
    if (rangeStartDay === null || rangeEndDay === null) return false;
    return day >= Math.min(rangeStartDay, rangeEndDay) && day <= Math.max(rangeStartDay, rangeEndDay);
  };

  // While copying or pasting, events let the pointer through to the day cell below
  const gestureActive = !!copySource || !!pasteSource;

  const clearDragState = () => {
    dragIdRef.current = null;
    setDraggingId(null);
    setDragOverDate(null);
    setDragOverEventId(null);
  };

  return (
    <div data-tour="calendar" className="flex flex-1 select-none flex-col overflow-hidden" onContextMenu={(e) => e.preventDefault()}>
      {/* Day headers */}
      <div className="grid grid-cols-7 border-b border-border">
        {DAYS.map((d, i) => (
          <div
            key={d}
            className={`py-3 text-center text-base font-medium ${
              i === 0 ? 'text-danger' : i === 6 ? 'text-primary' : 'text-muted'
            }`}
          >
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid flex-1 grid-cols-7 auto-rows-fr overflow-y-auto">
        {cells.map((day, i) => {
          if (day === null) {
            return <div key={`empty-${i}`} className="border-b border-r border-border/50" />;
          }
          const dateStr = getDateStr(day);
          const dayEvents = getEventsForDay(day);
          const isToday = dateStr === todayStr;
          const dayOfWeek = (firstDay + day - 1) % 7;
          const isDragOver = dragOverDate === dateStr;
          const isCopyTarget = copyTargetDate === dateStr;

          return (
            <div
              key={day}
              data-month-date={dateStr}
              onMouseDown={(e) => {
                if (e.button !== 0 || gestureActive) return;
                // Anywhere in the cell except on an event starts a click / range selection
                if ((e.target as HTMLElement).closest('[data-event-id]')) return;
                setRangeStartDay(day);
                setRangeEndDay(day);
              }}
              onClick={() => {
                if (pasteSource) onPasteClick?.(dateStr);
              }}
              onMouseEnter={() => {
                if (rangeStartDay !== null) {
                  setRangeEndDay(day);
                }
              }}
              onMouseUp={(e) => {
                if (rangeStartDay !== null && e.button === 0) {
                  const endDay = rangeEndDay ?? rangeStartDay;
                  rangeProcessed.current = true;
                  if (rangeStartDay !== endDay) {
                    const minD = Math.min(rangeStartDay, endDay);
                    const maxD = Math.max(rangeStartDay, endDay);
                    const dates: string[] = [];
                    for (let d = minD; d <= maxD; d++) dates.push(getDateStr(d));
                    onDateRangeSelect(dates);
                  } else {
                    onDateClick(dateStr);
                  }
                  setRangeStartDay(null);
                  setRangeEndDay(null);
                }
              }}
              onDragOver={(e) => {
                if (!dragIdRef.current) return;
                e.preventDefault();
                setDragOverDate(dateStr);
              }}
              onDragLeave={() => setDragOverDate((prev) => (prev === dateStr ? null : prev))}
              onDrop={(e) => {
                e.preventDefault();
                const eventId = e.dataTransfer.getData('eventId');
                clearDragState();
                if (eventId) {
                  onMoveEvent(eventId, dateStr);
                }
              }}
              className={`flex min-h-0 flex-col overflow-hidden border-b border-r border-border/50 p-2 transition-colors ${
                pasteSource ? 'cursor-copy' : 'cursor-pointer'
              } ${draggingId ? '' : 'hover:bg-card-hover'} ${isDragOver || isCopyTarget ? 'bg-primary/20' : ''} ${
                isInSelectedRange(day) ? 'bg-success/20' : ''
              }`}
            >
              <div
                className={`mb-1 inline-flex h-8 w-8 items-center justify-center rounded-full text-sm ${
                  isToday
                    ? 'bg-primary font-bold text-white'
                    : dayOfWeek === 0
                    ? 'text-danger'
                    : dayOfWeek === 6
                    ? 'text-primary'
                    : ''
                }`}
              >
                {day}
              </div>
              <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
                {dayEvents.map((ev) => (
                  <div
                    key={ev.id}
                    data-event-id={ev.id}
                    draggable={!gestureActive}
                    onDragStart={(e) => {
                      if (gestureActive) {
                        e.preventDefault();
                        return;
                      }
                      e.dataTransfer.setData('eventId', ev.id);
                      e.dataTransfer.effectAllowed = 'move';
                      dragIdRef.current = ev.id;
                      // Deferred so the browser snapshots the drag image before the chip fades
                      setTimeout(() => {
                        if (dragIdRef.current === ev.id) setDraggingId(ev.id);
                      }, 0);
                    }}
                    onDragEnd={clearDragState}
                    onDragOver={(e) => {
                      if (!dragIdRef.current || dragIdRef.current === ev.id) return;
                      e.preventDefault();
                      e.stopPropagation();
                      setDragOverEventId(ev.id);
                      setDragOverDate(null);
                    }}
                    onDragLeave={() => setDragOverEventId((prev) => (prev === ev.id ? null : prev))}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const sourceId = e.dataTransfer.getData('eventId');
                      clearDragState();
                      if (!sourceId || sourceId === ev.id) return;
                      onSwapEvents(sourceId, ev.id);
                    }}
                    onMouseDown={(e) => {
                      if (e.button === 2) {
                        e.stopPropagation();
                        setCopySource(ev);
                      }
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onEventClick(ev);
                    }}
                    className={`flex cursor-grab items-center gap-1 rounded px-1.5 py-1 text-xs font-medium leading-tight text-white active:cursor-grabbing ${
                      dragOverEventId === ev.id ? 'ring-2 ring-inset ring-white' : ''
                    }`}
                    style={{
                      backgroundColor: ev.color,
                      // The dragged chip itself must not be a drop target
                      pointerEvents: gestureActive || draggingId === ev.id ? 'none' : 'auto',
                      opacity: draggingId === ev.id ? 0.3 : ev.done ? 0.5 : undefined,
                    }}
                    title={ev.title}
                  >
                    <input
                      type="checkbox"
                      checked={ev.done}
                      onClick={(e) => e.stopPropagation()}
                      onChange={() => onToggleDone(ev.id)}
                      className="h-3 w-3 shrink-0 cursor-pointer accent-white"
                    />
                    <span className={`min-w-0 flex-1 truncate ${ev.done ? 'line-through' : ''}`}>
                      {ev.start_time && (
                        <span className="mr-1 opacity-80">{hhmm(ev.start_time)}</span>
                      )}
                      {ev.title}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
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
