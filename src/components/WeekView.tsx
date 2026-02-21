'use client';

import { useState, useRef, useEffect } from 'react';
import { Event } from '@/lib/supabase';

const DAYS = ['일', '월', '화', '수', '목', '금', '토'];
// 6시부터 시작, 0-5시는 아래로
const HOURS = [...Array.from({ length: 18 }, (_, i) => i + 6), ...Array.from({ length: 6 }, (_, i) => i)];

type Props = {
  year: number;
  month: number;
  day: number;
  events: Event[];
  onTimeClick: (date: string, time: string, endTime?: string) => void;
  onEventClick: (event: Event) => void;
  onMoveEvent: (eventId: string, newDate: string, newStartTime?: string) => void;
  onCopyEvent: (event: Event, newDate: string, newStartTime?: string) => void;
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

function formatDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function timeToY(time: string) {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export default function WeekView({ year, month, day, events, onTimeClick, onEventClick, onMoveEvent, onCopyEvent }: Props) {
  const weekDates = getWeekDates(year, month, day);
  const today = new Date();
  const todayStr = formatDate(today);
  const [dragOverCell, setDragOverCell] = useState<string | null>(null);

  // Range selection (left-click drag on empty cells)
  const [rangeStart, setRangeStart] = useState<{ date: string; hour: number } | null>(null);
  const [rangeEnd, setRangeEnd] = useState<number | null>(null);
  const rangeProcessed = useRef(false);

  // Right-click copy
  const [copySource, setCopySource] = useState<Event | null>(null);
  const [copyTargetKey, setCopyTargetKey] = useState<string | null>(null);
  const copyTargetRef = useRef<{ date: string; time?: string } | null>(null);

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

  // Right-click copy: track mouse and handle drop
  useEffect(() => {
    if (!copySource) return;

    const handleMove = (e: MouseEvent) => {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const cell = el?.closest('[data-cell-date]') as HTMLElement | null;
      if (cell) {
        const date = cell.getAttribute('data-cell-date')!;
        const hour = cell.getAttribute('data-cell-hour');
        copyTargetRef.current = { date, time: hour !== null ? `${hour.padStart(2, '0')}:00` : undefined };
        setCopyTargetKey(`${date}-${hour}`);
      } else {
        copyTargetRef.current = null;
        setCopyTargetKey(null);
      }
    };

    const handleUp = () => {
      if (copyTargetRef.current && copySource) {
        onCopyEvent(copySource, copyTargetRef.current.date, copyTargetRef.current.time);
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

  const getEventsForDate = (dateStr: string) =>
    events
      .filter((e) => e.date === dateStr && e.start_time)
      .sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));

  const getAllDayEvents = (dateStr: string) =>
    events.filter((e) => e.date === dateStr && !e.start_time);

  const isInRange = (dateStr: string, hour: number) => {
    if (!rangeStart || rangeEnd === null) return false;
    if (dateStr !== rangeStart.date) return false;
    const minH = Math.min(rangeStart.hour, rangeEnd);
    const maxH = Math.max(rangeStart.hour, rangeEnd);
    return hour >= minH && hour <= maxH;
  };

  const isCopyTarget = (cellKey: string) => copyTargetKey === cellKey;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="grid grid-cols-[70px_repeat(7,1fr)] border-b border-border">
        <div />
        {weekDates.map((d, i) => {
          const dateStr = formatDate(d);
          const isToday = dateStr === todayStr;
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
      <div className="grid grid-cols-[70px_repeat(7,1fr)] border-b border-border">
        <div className="flex items-center justify-center text-xs text-muted">종일</div>
        {weekDates.map((d, i) => {
          const dateStr = formatDate(d);
          const allDay = getAllDayEvents(dateStr);
          return (
            <div
              key={i}
              className="min-h-[32px] border-l border-border/50 p-1"
              data-cell-date={dateStr}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverCell(`allday-${dateStr}`);
              }}
              onDragLeave={() => setDragOverCell(null)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOverCell(null);
                const eventId = e.dataTransfer.getData('eventId');
                if (eventId) onMoveEvent(eventId, dateStr);
              }}
              style={{ backgroundColor: dragOverCell === `allday-${dateStr}` || isCopyTarget(`${dateStr}-null`) ? 'rgba(59,130,246,0.2)' : undefined }}
            >
              {allDay.map((ev) => (
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
                  onClick={() => onEventClick(ev)}
                  className="cursor-grab truncate rounded px-1.5 py-0.5 text-xs font-medium text-white active:cursor-grabbing"
                  style={{ backgroundColor: ev.color, pointerEvents: copySource ? 'none' : 'auto' }}
                >
                  {ev.title}
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {/* Time grid */}
      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-[70px_repeat(7,1fr)]">
          {HOURS.map((hour) => (
            <div key={hour} className="contents">
              <div className="relative h-16 border-b border-border/30 pr-3 text-right">
                <span className="-translate-y-1/2 text-xs text-muted">
                  {String(hour).padStart(2, '0')}:00
                </span>
              </div>
              {weekDates.map((d, di) => {
                const dateStr = formatDate(d);
                const cellKey = `${dateStr}-${hour}`;
                const hourEvents = getEventsForDate(dateStr).filter((e) => {
                  const h = parseInt(e.start_time!.split(':')[0]);
                  return h === hour;
                });
                const isDragOver = dragOverCell === cellKey;
                const inRange = isInRange(dateStr, hour);
                const isCopy = isCopyTarget(cellKey);
                return (
                  <div
                    key={di}
                    data-cell-date={dateStr}
                    data-cell-hour={String(hour)}
                    className={`relative h-16 cursor-pointer border-b border-l border-border/30 transition-colors hover:bg-card-hover/50 ${
                      isDragOver || isCopy ? 'bg-primary/20' : inRange ? 'bg-success/20' : ''
                    }`}
                    // Range selection
                    onMouseDown={(e) => {
                      if (e.button === 0 && e.target === e.currentTarget && !copySource) {
                        setRangeStart({ date: dateStr, hour });
                        setRangeEnd(hour);
                      }
                    }}
                    onMouseEnter={() => {
                      if (rangeStart && rangeStart.date === dateStr) {
                        setRangeEnd(hour);
                      }
                    }}
                    onMouseUp={(e) => {
                      if (rangeStart && e.button === 0) {
                        const startH = Math.min(rangeStart.hour, rangeEnd ?? rangeStart.hour);
                        const endH = Math.max(rangeStart.hour, rangeEnd ?? rangeStart.hour);
                        rangeProcessed.current = true;
                        if (startH !== endH) {
                          onTimeClick(
                            rangeStart.date,
                            `${String(startH).padStart(2, '0')}:00`,
                            `${String(endH + 1).padStart(2, '0')}:00`
                          );
                        } else {
                          onTimeClick(dateStr, `${String(hour).padStart(2, '0')}:00`);
                        }
                        setRangeStart(null);
                        setRangeEnd(null);
                      }
                    }}
                    // Move drag (HTML5)
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragOverCell(cellKey);
                    }}
                    onDragLeave={() => setDragOverCell(null)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragOverCell(null);
                      const eventId = e.dataTransfer.getData('eventId');
                      if (eventId) {
                        onMoveEvent(eventId, dateStr, `${String(hour).padStart(2, '0')}:00`);
                      }
                    }}
                  >
                    {hourEvents.map((ev) => {
                      const startMin = timeToY(ev.start_time!);
                      const endMin = ev.end_time ? timeToY(ev.end_time) : startMin + 60;
                      const top = ((startMin % 60) / 60) * 64;
                      const height = Math.max(((endMin - startMin) / 60) * 64, 22);
                      return (
                        <div
                          key={ev.id}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData('eventId', ev.id);
                            e.dataTransfer.effectAllowed = 'move';
                          }}
                          onContextMenu={(e) => e.preventDefault()}
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            if (e.button === 2) {
                              setCopySource(ev);
                            }
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            onEventClick(ev);
                          }}
                          className="absolute left-0.5 right-0.5 cursor-grab overflow-hidden rounded px-1.5 py-0.5 text-xs font-medium text-white active:cursor-grabbing"
                          style={{
                            backgroundColor: ev.color,
                            top: `${top}px`,
                            height: `${height}px`,
                            opacity: 0.9,
                            pointerEvents: copySource ? 'none' : 'auto',
                          }}
                        >
                          <div className="truncate">{ev.title}</div>
                          {height > 30 && (
                            <div className="truncate text-[11px] opacity-70">
                              {ev.start_time?.slice(0, 5)} - {ev.end_time?.slice(0, 5)}
                            </div>
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
    </div>
  );
}
