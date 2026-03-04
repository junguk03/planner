'use client';

import { useState, useRef, useEffect } from 'react';
import { Event } from '@/lib/supabase';

const DAYS = ['일', '월', '화', '수', '목', '금', '토'];

type Props = {
  year: number;
  month: number;
  events: Event[];
  onDateClick: (date: string) => void;
  onDateRangeSelect: (dates: string[]) => void;
  onEventClick: (event: Event) => void;
  onToggleDone: (eventId: string) => void;
  onMoveEvent: (eventId: string, newDate: string) => void;
  onCopyEvent: (event: Event, newDate: string) => void;
};

export default function MonthView({ year, month, events, onDateClick, onDateRangeSelect, onEventClick, onToggleDone, onMoveEvent, onCopyEvent }: Props) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);

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

  const getSelectedRange = () => {
    if (rangeStartDay === null || rangeEndDay === null) return [];
    const minDay = Math.min(rangeStartDay, rangeEndDay);
    const maxDay = Math.max(rangeStartDay, rangeEndDay);
    const dates: string[] = [];
    for (let d = minDay; d <= maxDay; d++) {
      dates.push(getDateStr(d));
    }
    return dates;
  };

  // Right-click copy
  const [copySource, setCopySource] = useState<Event | null>(null);
  const [copyTargetDate, setCopyTargetDate] = useState<string | null>(null);
  const copyTargetRef = useRef<string | null>(null);

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
      if (copyTargetRef.current && copySource) {
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

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
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
                if (e.button === 0 && e.target === e.currentTarget && !copySource) {
                  setRangeStartDay(day);
                  setRangeEndDay(day);
                }
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
                e.preventDefault();
                setDragOverDate(dateStr);
              }}
              onDragLeave={() => setDragOverDate(null)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOverDate(null);
                const eventId = e.dataTransfer.getData('eventId');
                if (eventId) {
                  onMoveEvent(eventId, dateStr);
                }
              }}
              className={`cursor-pointer border-b border-r border-border/50 p-2 transition-colors hover:bg-card-hover ${
                isDragOver || isCopyTarget ? 'bg-primary/20' : ''
              } ${getSelectedRange().includes(dateStr) ? 'bg-success/20' : ''}`}
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
              <div className="space-y-1">
                {dayEvents.map((ev) => (
                  <div
                    key={ev.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('eventId', ev.id);
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                    onContextMenu={(e) => e.preventDefault()}
                    onMouseDown={(e) => {
                      if (e.button === 2) {
                        e.stopPropagation();
                        setCopySource(ev);
                      }
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleDone(ev.id);
                    }}
                    className={`cursor-grab rounded px-1.5 py-1 text-xs font-medium text-white leading-tight active:cursor-grabbing flex items-center gap-1 ${ev.done ? 'opacity-50' : ''}`}
                    style={{ backgroundColor: ev.color, pointerEvents: copySource ? 'none' : 'auto' }}
                    title={ev.title}
                  >
                    <input
                      type="checkbox"
                      checked={ev.done}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => { e.stopPropagation(); onToggleDone(ev.id); }}
                      className="h-3 w-3 shrink-0 accent-white cursor-pointer"
                    />
                    <span className={`min-w-0 flex-1 truncate ${ev.done ? 'line-through' : ''}`}>
                      {ev.start_time && (
                        <span className="mr-1 opacity-80">{ev.start_time.slice(0, 5)}</span>
                      )}
                      {ev.title}
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); onEventClick(ev); }}
                      className="shrink-0 rounded p-0.5 opacity-70 hover:opacity-100 hover:bg-white/20"
                      title="수정"
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                    </button>
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
    </div>
  );
}
