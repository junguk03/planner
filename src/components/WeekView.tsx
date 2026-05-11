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
  onToggleDone: (eventId: string) => void;
  onMoveEvent: (eventId: string, newDate: string, newStartTime?: string) => void;
  onSwapEvents: (sourceId: string, targetId: string) => void;
  onCopyEvent: (event: Event, newDate: string, newStartTime?: string) => void;
  onResizeFill: (source: Event, targetDate: string, targetEndHour: number) => void;
  pasteSource?: Event | null;
  onPasteClick?: (date: string, time?: string) => void;
  onCancelPaste?: () => void;
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

export default function WeekView({ year, month, day, events, onTimeClick, onEventClick, onToggleDone, onMoveEvent, onSwapEvents, onCopyEvent, onResizeFill, pasteSource, onPasteClick, onCancelPaste }: Props) {
  const weekDates = getWeekDates(year, month, day);
  const today = new Date();
  const todayStr = formatDate(today);
  const [dragOverCell, setDragOverCell] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  // Range selection (left-click drag on empty cells)
  const [rangeStart, setRangeStart] = useState<{ date: string; hour: number } | null>(null);
  const [rangeEnd, setRangeEnd] = useState<number | null>(null);
  const rangeProcessed = useRef(false);

  // Right-click copy
  const [copySource, setCopySource] = useState<Event | null>(null);
  const [copyTargetKey, setCopyTargetKey] = useState<string | null>(null);
  const copyTargetRef = useRef<{ date: string; time?: string } | null>(null);

  // Resize/fill drag (bottom-right handle on time-grid events)
  const [resizeSource, setResizeSource] = useState<Event | null>(null);
  const [resizeTarget, setResizeTarget] = useState<{ date: string; hour: number } | null>(null);
  const resizeTargetRef = useRef<{ date: string; hour: number } | null>(null);

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

    const handleMove = (e: MouseEvent) => {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const cell = el?.closest('[data-cell-date][data-cell-hour]') as HTMLElement | null;
      if (cell) {
        const date = cell.getAttribute('data-cell-date')!;
        const hour = parseInt(cell.getAttribute('data-cell-hour')!);
        resizeTargetRef.current = { date, hour };
        setResizeTarget({ date, hour });
      }
    };

    const handleUp = () => {
      const target = resizeTargetRef.current;
      if (target && resizeSource) {
        onResizeFill(resizeSource, target.date, target.hour);
      }
      setResizeSource(null);
      setResizeTarget(null);
      resizeTargetRef.current = null;
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

  // Is this cell inside the active resize-fill rectangle?
  const isResizeArea = (dateStr: string, hour: number) => {
    if (!resizeSource || !resizeTarget) return false;
    const sourceStartHour = resizeSource.start_time ? parseInt(resizeSource.start_time.split(':')[0]) : 0;
    const sourceIdx = weekDates.findIndex((d) => formatDate(d) === resizeSource.date);
    const targetIdx = weekDates.findIndex((d) => formatDate(d) === resizeTarget.date);
    const cellIdx = weekDates.findIndex((d) => formatDate(d) === dateStr);
    if (sourceIdx < 0 || targetIdx < 0 || cellIdx < 0) return false;
    const minIdx = Math.min(sourceIdx, targetIdx);
    const maxIdx = Math.max(sourceIdx, targetIdx);
    const minH = Math.min(sourceStartHour, resizeTarget.hour);
    const maxH = Math.max(sourceStartHour, resizeTarget.hour);
    return cellIdx >= minIdx && cellIdx <= maxIdx && hour >= minH && hour <= maxH;
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="grid grid-cols-[70px_repeat(7,minmax(0,1fr))] border-b border-border">
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
      <div className="grid grid-cols-[70px_repeat(7,minmax(0,1fr))] border-b border-border">
        <div className="flex items-center justify-center text-xs text-muted">종일</div>
        {weekDates.map((d, i) => {
          const dateStr = formatDate(d);
          const allDay = getAllDayEvents(dateStr);
          return (
            <div
              key={i}
              className="flex min-h-[32px] flex-col gap-0.5 overflow-hidden border-l border-border/50 p-1"
              data-cell-date={dateStr}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverCell(`allday-${dateStr}`);
              }}
              onDragLeave={() => setDragOverCell((prev) => (prev === `allday-${dateStr}` ? null : prev))}
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
                    setDraggingId(ev.id);
                  }}
                  onDragEnd={() => {
                    setDraggingId(null);
                    setDragOverCell(null);
                  }}
                  onDragOver={(e) => {
                    if (e.dataTransfer.types.length > 0) {
                      e.preventDefault();
                    }
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const sourceId = e.dataTransfer.getData('eventId');
                    if (!sourceId || sourceId === ev.id) return;
                    if (e.shiftKey) {
                      onSwapEvents(sourceId, ev.id);
                    } else {
                      onMoveEvent(sourceId, ev.date); // all-day target
                    }
                  }}
                  onContextMenu={(e) => e.preventDefault()}
                  onMouseDown={(e) => {
                    if (e.button === 2) {
                      e.stopPropagation();
                      setCopySource(ev);
                    }
                  }}
                  onClick={(e) => { e.stopPropagation(); onToggleDone(ev.id); }}
                  className={`flex min-w-0 cursor-grab items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium text-white active:cursor-grabbing ${ev.done ? 'opacity-50' : ''}`}
                  style={{
                    backgroundColor: ev.color,
                    pointerEvents: copySource ? 'none' : 'auto',
                    opacity: draggingId === ev.id ? 0.3 : undefined,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={ev.done}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => { e.stopPropagation(); onToggleDone(ev.id); }}
                    className="h-3 w-3 shrink-0 accent-white cursor-pointer"
                  />
                  <span className={`min-w-0 flex-1 truncate ${ev.done ? 'line-through' : ''}`}>{ev.title}</span>
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
          );
        })}
      </div>

      {/* Time grid */}
      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-[70px_repeat(7,minmax(0,1fr))]">
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
                const inResize = isResizeArea(dateStr, hour);
                return (
                  <div
                    key={di}
                    data-cell-date={dateStr}
                    data-cell-hour={String(hour)}
                    className={`relative h-16 cursor-pointer border-b border-l border-border/30 transition-colors ${
                      draggingId ? '' : 'hover:bg-card-hover/50'
                    } ${
                      inResize ? 'bg-warning/30' : isDragOver || isCopy ? 'bg-primary/20' : inRange ? 'bg-success/20' : ''
                    }`}
                    onClick={(e) => {
                      if (pasteSource && e.target === e.currentTarget) {
                        onPasteClick?.(dateStr, `${String(hour).padStart(2, '0')}:00`);
                      }
                    }}
                    // Range selection
                    onMouseDown={(e) => {
                      if (e.button === 0 && e.target === e.currentTarget && !copySource && !pasteSource && !resizeSource) {
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
                    onDragLeave={() => setDragOverCell((prev) => (prev === cellKey ? null : prev))}
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
                            setDraggingId(ev.id);
                          }}
                          onDragEnd={() => {
                            setDraggingId(null);
                            setDragOverCell(null);
                          }}
                          onDragOver={(e) => {
                            if (e.dataTransfer.types.length > 0) {
                              e.preventDefault();
                            }
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const sourceId = e.dataTransfer.getData('eventId');
                            if (!sourceId || sourceId === ev.id) return;
                            if (e.shiftKey) {
                              onSwapEvents(sourceId, ev.id);
                            } else {
                              const hour = parseInt(ev.start_time!.split(':')[0]);
                              onMoveEvent(sourceId, ev.date, `${String(hour).padStart(2, '0')}:00`);
                            }
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
                            onToggleDone(ev.id);
                          }}
                          className={`absolute left-0.5 right-0.5 cursor-grab overflow-hidden rounded px-1.5 py-0.5 text-xs font-medium text-white active:cursor-grabbing ${ev.done ? 'opacity-50' : ''}`}
                          style={{
                            backgroundColor: ev.color,
                            top: `${top}px`,
                            height: `${height}px`,
                            opacity: draggingId === ev.id ? 0.3 : ev.done ? 0.5 : 0.9,
                            pointerEvents: copySource ? 'none' : 'auto',
                          }}
                        >
                          <div className="flex items-center gap-1">
                            <input
                              type="checkbox"
                              checked={ev.done}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => { e.stopPropagation(); onToggleDone(ev.id); }}
                              className="h-3 w-3 shrink-0 accent-white cursor-pointer"
                            />
                            <span className={`min-w-0 flex-1 truncate ${ev.done ? 'line-through' : ''}`}>{ev.title}</span>
                            <button
                              onClick={(e) => { e.stopPropagation(); onEventClick(ev); }}
                              className="shrink-0 rounded p-0.5 opacity-70 hover:opacity-100 hover:bg-white/20"
                              title="수정"
                            >
                              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                              </svg>
                            </button>
                          </div>
                          {height > 30 && (
                            <div className={`truncate text-[11px] opacity-70 pl-4 ${ev.done ? 'line-through' : ''}`}>
                              {ev.start_time?.slice(0, 5)} - {ev.end_time?.slice(0, 5)}
                            </div>
                          )}
                          {/* Resize/fill handle (bottom-right) */}
                          <div
                            onMouseDown={(e) => {
                              if (e.button !== 0) return;
                              e.preventDefault();
                              e.stopPropagation();
                              setResizeSource(ev);
                              const startHour = parseInt(ev.start_time!.split(':')[0]);
                              resizeTargetRef.current = { date: ev.date, hour: startHour };
                              setResizeTarget({ date: ev.date, hour: startHour });
                            }}
                            className="absolute bottom-0 right-0 h-3 w-3 cursor-se-resize bg-white/30 hover:bg-white/60"
                            title="끌어서 채우기"
                          />
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
