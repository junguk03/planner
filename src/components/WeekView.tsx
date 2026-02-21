'use client';

import { Event } from '@/lib/supabase';

const DAYS = ['일', '월', '화', '수', '목', '금', '토'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

type Props = {
  year: number;
  month: number;
  day: number;
  events: Event[];
  onTimeClick: (date: string, time: string) => void;
  onEventClick: (event: Event) => void;
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

export default function WeekView({ year, month, day, events, onTimeClick, onEventClick }: Props) {
  const weekDates = getWeekDates(year, month, day);
  const today = new Date();
  const todayStr = formatDate(today);

  const getEventsForDate = (dateStr: string) =>
    events
      .filter((e) => e.date === dateStr && e.start_time)
      .sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));

  const getAllDayEvents = (dateStr: string) =>
    events.filter((e) => e.date === dateStr && !e.start_time);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-border">
        <div />
        {weekDates.map((d, i) => {
          const dateStr = formatDate(d);
          const isToday = dateStr === todayStr;
          return (
            <div key={i} className="border-l border-border/50 py-2 text-center">
              <div className={`text-xs ${i === 0 ? 'text-danger' : i === 6 ? 'text-primary' : 'text-muted'}`}>
                {DAYS[i]}
              </div>
              <div
                className={`mx-auto mt-0.5 flex h-7 w-7 items-center justify-center rounded-full text-sm font-medium ${
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
      <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-border">
        <div className="flex items-center justify-center text-[10px] text-muted">종일</div>
        {weekDates.map((d, i) => {
          const dateStr = formatDate(d);
          const allDay = getAllDayEvents(dateStr);
          return (
            <div key={i} className="min-h-[28px] border-l border-border/50 p-0.5">
              {allDay.map((ev) => (
                <div
                  key={ev.id}
                  onClick={() => onEventClick(ev)}
                  className="cursor-pointer truncate rounded px-1 py-0.5 text-[10px] font-medium text-white"
                  style={{ backgroundColor: ev.color }}
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
        <div className="grid grid-cols-[60px_repeat(7,1fr)]">
          {HOURS.map((hour) => (
            <div key={hour} className="contents">
              <div className="relative h-14 border-b border-border/30 pr-2 text-right">
                <span className="-translate-y-1/2 text-[10px] text-muted">
                  {String(hour).padStart(2, '0')}:00
                </span>
              </div>
              {weekDates.map((d, di) => {
                const dateStr = formatDate(d);
                const hourEvents = getEventsForDate(dateStr).filter((e) => {
                  const h = parseInt(e.start_time!.split(':')[0]);
                  return h === hour;
                });
                return (
                  <div
                    key={di}
                    className="relative h-14 cursor-pointer border-b border-l border-border/30 transition-colors hover:bg-card-hover/50"
                    onClick={() => onTimeClick(dateStr, `${String(hour).padStart(2, '0')}:00`)}
                  >
                    {hourEvents.map((ev) => {
                      const startMin = timeToY(ev.start_time!);
                      const endMin = ev.end_time ? timeToY(ev.end_time) : startMin + 60;
                      const top = ((startMin % 60) / 60) * 56;
                      const height = Math.max(((endMin - startMin) / 60) * 56, 18);
                      return (
                        <div
                          key={ev.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            onEventClick(ev);
                          }}
                          className="absolute left-0.5 right-0.5 cursor-pointer overflow-hidden rounded px-1 py-0.5 text-[10px] font-medium text-white"
                          style={{
                            backgroundColor: ev.color,
                            top: `${top}px`,
                            height: `${height}px`,
                            opacity: 0.9,
                          }}
                        >
                          <div className="truncate">{ev.title}</div>
                          {height > 24 && (
                            <div className="truncate opacity-70">
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
    </div>
  );
}
