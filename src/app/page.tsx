'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase, Event } from '@/lib/supabase';
import Login from '@/components/Login';
import MonthView from '@/components/MonthView';
import WeekView from '@/components/WeekView';
import EventModal from '@/components/EventModal';

type ViewMode = 'month' | 'week';

export default function Home() {
  const [user, setUser] = useState<{ id: string; email: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewMode>('month');
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth());
  const [selectedDay, setSelectedDay] = useState(new Date().getDate());
  const [events, setEvents] = useState<Event[]>([]);
  const [modal, setModal] = useState<{
    open: boolean;
    event: Partial<Event> | null;
    date: string;
  }>({ open: false, event: null, date: '' });

  // Check auth
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser({ id: session.user.id, email: session.user.email! });
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser({ id: session.user.id, email: session.user.email! });
      } else {
        setUser(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Fetch events
  const fetchEvents = useCallback(async () => {
    if (!user) return;

    const fetchStart = new Date(year, month, 1);
    fetchStart.setDate(fetchStart.getDate() - 7);
    const fetchEnd = new Date(year, month + 1, 0);
    fetchEnd.setDate(fetchEnd.getDate() + 7);

    const fmtDate = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    const { data, error } = await supabase
      .from('events')
      .select('*')
      .eq('user_id', user.id)
      .gte('date', fmtDate(fetchStart))
      .lte('date', fmtDate(fetchEnd))
      .order('date')
      .order('start_time');

    if (!error && data) {
      setEvents(data);
    }
  }, [user, year, month]);

  useEffect(() => {
    void fetchEvents();
  }, [fetchEvents]);

  // Navigation
  const goToday = () => {
    const now = new Date();
    setYear(now.getFullYear());
    setMonth(now.getMonth());
    setSelectedDay(now.getDate());
  };

  const goPrev = () => {
    if (view === 'month') {
      if (month === 0) {
        setYear(year - 1);
        setMonth(11);
      } else {
        setMonth(month - 1);
      }
    } else {
      const d = new Date(year, month, selectedDay - 7);
      setYear(d.getFullYear());
      setMonth(d.getMonth());
      setSelectedDay(d.getDate());
    }
  };

  const goNext = () => {
    if (view === 'month') {
      if (month === 11) {
        setYear(year + 1);
        setMonth(0);
      } else {
        setMonth(month + 1);
      }
    } else {
      const d = new Date(year, month, selectedDay + 7);
      setYear(d.getFullYear());
      setMonth(d.getMonth());
      setSelectedDay(d.getDate());
    }
  };

  // CRUD
  const saveEvent = async (eventData: Partial<Event>) => {
    if (!user) return;

    if (eventData.id) {
      await supabase
        .from('events')
        .update({
          title: eventData.title,
          description: eventData.description,
          date: eventData.date,
          start_time: eventData.start_time,
          end_time: eventData.end_time,
          color: eventData.color,
        })
        .eq('id', eventData.id);
    } else {
      await supabase.from('events').insert({
        user_id: user.id,
        title: eventData.title,
        description: eventData.description,
        date: eventData.date,
        start_time: eventData.start_time,
        end_time: eventData.end_time,
        color: eventData.color,
      });
    }

    setModal({ open: false, event: null, date: '' });
    fetchEvents();
  };

  const deleteEvent = async (id: string) => {
    await supabase.from('events').delete().eq('id', id);
    setModal({ open: false, event: null, date: '' });
    fetchEvents();
  };

  const moveEvent = async (eventId: string, newDate: string, newStartTime?: string) => {
    const event = events.find((e) => e.id === eventId);
    if (!event) return;

    const updateData: Record<string, string | null> = { date: newDate };
    if (newStartTime !== undefined) {
      const oldStart = event.start_time;
      const oldEnd = event.end_time;
      updateData.start_time = newStartTime;
      if (oldStart && oldEnd) {
        const oldStartMin = parseInt(oldStart.split(':')[0]) * 60 + parseInt(oldStart.split(':')[1]);
        const oldEndMin = parseInt(oldEnd.split(':')[0]) * 60 + parseInt(oldEnd.split(':')[1]);
        const duration = oldEndMin - oldStartMin;
        const newStartMin = parseInt(newStartTime.split(':')[0]) * 60 + parseInt(newStartTime.split(':')[1]);
        const newEndMin = newStartMin + duration;
        updateData.end_time = `${String(Math.floor(newEndMin / 60)).padStart(2, '0')}:${String(newEndMin % 60).padStart(2, '0')}`;
      }
    }

    await supabase.from('events').update(updateData).eq('id', eventId);
    fetchEvents();
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setEvents([]);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-muted">로딩 중...</div>
      </div>
    );
  }

  if (!user) {
    return <Login onLogin={() => {}} />;
  }

  const monthLabel = `${year}년 ${month + 1}월`;

  return (
    <div className="flex h-screen flex-col">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold">Planner</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={goPrev}
              className="rounded-lg px-3 py-1.5 text-base transition-colors hover:bg-card-hover"
            >
              ◀
            </button>
            <span className="min-w-[140px] text-center text-base font-medium">{monthLabel}</span>
            <button
              onClick={goNext}
              className="rounded-lg px-3 py-1.5 text-base transition-colors hover:bg-card-hover"
            >
              ▶
            </button>
          </div>
          <button
            onClick={goToday}
            className="rounded-lg border border-border px-4 py-1.5 text-sm transition-colors hover:bg-card-hover"
          >
            오늘
          </button>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex overflow-hidden rounded-lg border border-border">
            <button
              onClick={() => setView('month')}
              className={`px-4 py-1.5 text-sm transition-colors ${
                view === 'month' ? 'bg-primary text-white' : 'hover:bg-card-hover'
              }`}
            >
              월
            </button>
            <button
              onClick={() => setView('week')}
              className={`px-4 py-1.5 text-sm transition-colors ${
                view === 'week' ? 'bg-primary text-white' : 'hover:bg-card-hover'
              }`}
            >
              주
            </button>
          </div>
          <button
            onClick={logout}
            className="rounded-lg px-4 py-1.5 text-sm text-muted transition-colors hover:bg-card-hover hover:text-danger"
          >
            로그아웃
          </button>
        </div>
      </header>

      {/* Calendar */}
      {view === 'month' ? (
        <MonthView
          year={year}
          month={month}
          events={events}
          onDateClick={(date) => {
            setModal({ open: true, event: {}, date });
          }}
          onEventClick={(event) => {
            setModal({ open: true, event, date: event.date });
          }}
          onMoveEvent={moveEvent}
        />
      ) : (
        <WeekView
          year={year}
          month={month}
          day={selectedDay}
          events={events}
          onTimeClick={(date, time) => {
            setModal({ open: true, event: { start_time: time }, date });
          }}
          onEventClick={(event) => {
            setModal({ open: true, event, date: event.date });
          }}
          onMoveEvent={moveEvent}
        />
      )}

      {/* Modal */}
      {modal.open && (
        <EventModal
          event={modal.event}
          date={modal.date}
          onSave={saveEvent}
          onDelete={deleteEvent}
          onClose={() => setModal({ open: false, event: null, date: '' })}
        />
      )}
    </div>
  );
}
