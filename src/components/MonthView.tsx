'use client';

import { Event } from '@/lib/supabase';

const DAYS = ['일', '월', '화', '수', '목', '금', '토'];

type Props = {
  year: number;
  month: number;
  events: Event[];
  onDateClick: (date: string) => void;
  onEventClick: (event: Event) => void;
};

export default function MonthView({ year, month, events, onDateClick, onEventClick }: Props) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

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
      <div className="grid flex-1 grid-cols-7 auto-rows-fr">
        {cells.map((day, i) => {
          if (day === null) {
            return <div key={`empty-${i}`} className="border-b border-r border-border/50" />;
          }
          const dateStr = getDateStr(day);
          const dayEvents = getEventsForDay(day);
          const isToday = dateStr === todayStr;
          const dayOfWeek = (firstDay + day - 1) % 7;

          return (
            <div
              key={day}
              onClick={() => onDateClick(dateStr)}
              className="cursor-pointer border-b border-r border-border/50 p-2 transition-colors hover:bg-card-hover"
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
                {dayEvents.slice(0, 3).map((ev) => (
                  <div
                    key={ev.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      onEventClick(ev);
                    }}
                    className="truncate rounded px-1.5 py-1 text-xs font-medium text-white leading-tight"
                    style={{ backgroundColor: ev.color }}
                    title={ev.title}
                  >
                    {ev.start_time && (
                      <span className="mr-1 opacity-80">{ev.start_time.slice(0, 5)}</span>
                    )}
                    {ev.title}
                  </div>
                ))}
                {dayEvents.length > 3 && (
                  <div className="px-1.5 text-xs text-muted">
                    +{dayEvents.length - 3}개
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
